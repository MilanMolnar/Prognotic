import { isGooglePushEligible } from '@shared/calendar'
import type { GoogleCalendarConnectionResult, GoogleCalendarSyncResult } from '@shared/types'
import { randomUUID } from 'crypto'
import { shell } from 'electron'
import { google, type calendar_v3 } from 'googleapis'
import { CodeChallengeMethod } from 'google-auth-library'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import {
    getGoogleOAuthClientCredentials,
    getGoogleRefreshToken,
    getSettings,
    setGoogleRefreshToken,
    setSettings
} from '../lib'
import {
    calendarItemSyncHash,
    findCalendarItemForGoogleEvent,
    googleEventFields,
    googleEventPayloadForItem,
    type GoogleEventLike
} from './syncHelpers'
import {
    clearGoogleSyncToken,
    getCalendarItems,
    mutateCalendarState,
    prepareGoogleAccount,
    readCalendarState
} from './store'

const calendarId = 'primary'
const oauthScopes = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.events'
]
const oauthTimeoutMs = 2 * 60 * 1000

const statusCode = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') return undefined
    const value = error as { code?: unknown; response?: { status?: unknown } }
    if (typeof value.response?.status === 'number') return value.response.status
    if (typeof value.code === 'number') return value.code
    const parsed = Number(value.code)
    return Number.isFinite(parsed) ? parsed : undefined
}

const errorMessage = (error: unknown): string => {
    if (!error || typeof error !== 'object') return 'Google Calendar request failed.'
    const value = error as {
        message?: unknown
        response?: { data?: { error?: string | { message?: string }; error_description?: string } }
    }
    const responseError = value.response?.data?.error
    const message = typeof responseError === 'string'
        ? value.response?.data?.error_description || responseError
        : responseError?.message
    return typeof message === 'string'
        ? message
        : typeof value.message === 'string'
            ? value.message
            : 'Google Calendar request failed.'
}

const isRevokedTokenError = (error: unknown): boolean => {
    const message = errorMessage(error).toLowerCase()
    return statusCode(error) === 401 || message.includes('invalid_grant') || message.includes('invalid credentials')
}

const oauthClient = async (redirectUri?: string): Promise<InstanceType<typeof google.auth.OAuth2>> => {
    const { clientId, clientSecret } = await getGoogleOAuthClientCredentials()
    if (!clientId) {
        throw new Error('Configure a Google Desktop OAuth client in Settings before connecting.')
    }
    return new google.auth.OAuth2({ clientId, clientSecret: clientSecret || undefined, redirectUri })
}

const waitForAuthorization = async (): Promise<{
    client: InstanceType<typeof google.auth.OAuth2>
    code: string
    codeVerifier: string
    redirectUri: string
}> => {
    const state = randomUUID()
    let resolveCode: ((code: string) => void) | undefined
    let rejectCode: ((error: Error) => void) | undefined
    const codePromise = new Promise<string>((resolve, reject) => {
        resolveCode = resolve
        rejectCode = reject
    })

    const server = createServer((request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (requestUrl.pathname !== '/oauth2callback') {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end('Not found')
            return
        }
        const returnedState = requestUrl.searchParams.get('state')
        const error = requestUrl.searchParams.get('error')
        const code = requestUrl.searchParams.get('code')
        if (returnedState !== state) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end('The authorization state did not match. Return to Prognotic and try again.')
            rejectCode?.(new Error('Google authorization state validation failed.'))
            return
        }
        if (error || !code) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end('Google Calendar access was not granted. You can close this tab.')
            rejectCode?.(new Error(error === 'access_denied'
                ? 'Google Calendar access was cancelled.'
                : 'Google did not return an authorization code.'))
            return
        }
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
        })
        response.end('<!doctype html><title>Prognotic connected</title><body style="font-family:system-ui;background:#18181b;color:#fafafa;padding:32px"><h1>Google Calendar connected</h1><p>You can close this tab and return to Prognotic.</p></body>')
        resolveCode?.(code)
    })

    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', () => resolve())
        })
        const address = server.address() as AddressInfo
        const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`
        const client = await oauthClient(redirectUri)
        const verifier = await client.generateCodeVerifierAsync()
        if (!verifier.codeChallenge) throw new Error('Could not create a secure Google authorization challenge.')
        const authorizationUrl = client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: oauthScopes,
            state,
            code_challenge: verifier.codeChallenge,
            code_challenge_method: CodeChallengeMethod.S256,
            include_granted_scopes: true
        })
        await shell.openExternal(authorizationUrl)
        let timeout: ReturnType<typeof setTimeout> | undefined
        const code = await Promise.race([
            codePromise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new Error('Google authorization timed out.')),
                    oauthTimeoutMs
                )
            })
        ]).finally(() => {
            if (timeout) clearTimeout(timeout)
        })
        return { client, code, codeVerifier: verifier.codeVerifier, redirectUri }
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
}

export const connectGoogleCalendar = async (): Promise<GoogleCalendarConnectionResult> => {
    try {
        const authorization = await waitForAuthorization()
        const { tokens } = await authorization.client.getToken({
            code: authorization.code,
            codeVerifier: authorization.codeVerifier,
            redirect_uri: authorization.redirectUri
        })
        if (!tokens.refresh_token) {
            throw new Error('Google did not return a refresh token. Revoke the existing grant and try Connect again.')
        }
        authorization.client.setCredentials(tokens)
        const profile = await google.oauth2({ version: 'v2', auth: authorization.client }).userinfo.get()
        const email = profile.data.email?.trim()
        if (!email) throw new Error('Google did not return the connected account email.')

        await prepareGoogleAccount(email)
        await setGoogleRefreshToken(tokens.refresh_token)
        const current = await getSettings()
        const settings = await setSettings({
            googleCalendar: {
                ...current.googleCalendar,
                connectedEmail: email,
                lastSyncStatus: 'idle',
                lastSyncMessage: 'Connected. Enable a sync direction, then sync when ready.'
            }
        })
        return { ok: true, settings }
    } catch (error) {
        return { ok: false, error: errorMessage(error), settings: await getSettings() }
    }
}

export const disconnectGoogleCalendar = async (): Promise<GoogleCalendarConnectionResult> => {
    const refreshToken = await getGoogleRefreshToken()
    let revokeWarning: string | undefined
    if (refreshToken) {
        try {
            const client = await oauthClient()
            await client.revokeToken(refreshToken)
        } catch (error) {
            revokeWarning = `The local connection was removed, but Google could not confirm revocation: ${errorMessage(error)}`
        }
    }
    await setGoogleRefreshToken('')
    await clearGoogleSyncToken()
    const current = await getSettings()
    const settings = await setSettings({
        googleCalendar: {
            ...current.googleCalendar,
            enabled: false,
            connectedEmail: undefined,
            lastSyncStatus: revokeWarning ? 'error' : 'idle',
            lastSyncMessage: revokeWarning ?? 'Disconnected from Google Calendar.'
        }
    })
    return { ok: true, ...(revokeWarning ? { error: revokeWarning } : {}), settings }
}

const authorizedCalendar = async (): Promise<calendar_v3.Calendar> => {
    const refreshToken = await getGoogleRefreshToken()
    if (!refreshToken) throw new Error('Connect a Google account before syncing.')
    const client = await oauthClient()
    client.setCredentials({ refresh_token: refreshToken })
    return google.calendar({ version: 'v3', auth: client })
}

type PullResult = {
    events: calendar_v3.Schema$Event[]
    syncToken?: string
}

const pullEvents = async (
    calendar: calendar_v3.Calendar,
    syncToken?: string
): Promise<PullResult> => {
    const events: calendar_v3.Schema$Event[] = []
    let pageToken: string | undefined
    let nextSyncToken: string | undefined
    do {
        const response = await calendar.events.list({
            calendarId,
            maxResults: 2500,
            showDeleted: true,
            singleEvents: true,
            ...(syncToken ? { syncToken } : {}),
            ...(pageToken ? { pageToken } : {})
        })
        events.push(...(response.data.items ?? []))
        pageToken = response.data.nextPageToken ?? undefined
        nextSyncToken = response.data.nextSyncToken ?? nextSyncToken
    } while (pageToken)
    return { events, ...(nextSyncToken ? { syncToken: nextSyncToken } : {}) }
}

type SyncCounts = { imported: number; pushed: number; deleted: number; conflicts: number }

const applyRemoteEvents = async (
    events: calendar_v3.Schema$Event[],
    syncToken: string | undefined,
    counts: SyncCounts
): Promise<void> => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await mutateCalendarState((state) => {
        const now = Date.now()
        for (const event of events) {
            const eventLike = event as GoogleEventLike
            const currentItems = Object.values(state.items)
            const existing = findCalendarItemForGoogleEvent(currentItems, eventLike, calendarId)
            const remoteUpdatedAt = event.updated ? Date.parse(event.updated) : now

            if (event.status === 'cancelled') {
                if (!existing) continue
                const localChanged = existing.google
                    ? calendarItemSyncHash(existing) !== existing.google.lastSyncedLocalHash
                    : false
                if (localChanged && existing.updatedAt > remoteUpdatedAt) {
                    // Explicit latest-writer rule: a newer local verified edit
                    // is recreated on Google; otherwise the remote delete wins.
                    delete existing.google
                    counts.conflicts += 1
                } else {
                    delete state.items[existing.id]
                    counts.deleted += 1
                }
                continue
            }

            if (!event.id) continue
            const fields = googleEventFields(eventLike, timeZone)
            if (!fields) continue
            const etag = event.etag ?? undefined
            const syncedHash = calendarItemSyncHash(fields)

            if (!existing) {
                const id = randomUUID()
                state.items[id] = {
                    id,
                    source: 'google',
                    sourceOrder: 0,
                    sourceText: 'Imported from Google Calendar',
                    sourceFingerprint: `google:${event.id}`,
                    title: fields.title,
                    excerpt: 'Imported from Google Calendar. Validate before treating this event as verified.',
                    status: 'pending_validation',
                    confidence: 1,
                    start: fields.start,
                    end: fields.end,
                    allDay: fields.allDay,
                    timeZone: fields.timeZone,
                    google: {
                        calendarId,
                        eventId: event.id,
                        ...(etag ? { etag } : {}),
                        remoteUpdatedAt,
                        lastSyncedAt: now,
                        lastSyncedLocalHash: syncedHash
                    },
                    createdAt: now,
                    updatedAt: remoteUpdatedAt
                }
                counts.imported += 1
                continue
            }

            const localHash = calendarItemSyncHash(existing)
            if (!existing.google) {
                existing.google = {
                    calendarId,
                    eventId: event.id,
                    ...(etag ? { etag } : {}),
                    remoteUpdatedAt,
                    lastSyncedAt: now,
                    lastSyncedLocalHash: syncedHash
                }
                if (localHash !== syncedHash) {
                    Object.assign(existing, fields, {
                        status: 'pending_validation',
                        resolution: undefined,
                        updatedAt: remoteUpdatedAt
                    })
                }
                delete existing.deletedAt
                continue
            }

            const remoteChanged = !etag || existing.google.etag !== etag
            if (!remoteChanged) continue
            const localChanged = localHash !== existing.google.lastSyncedLocalHash
            if (localChanged && existing.updatedAt > remoteUpdatedAt) {
                existing.google = {
                    ...existing.google,
                    ...(etag ? { etag } : {}),
                    remoteUpdatedAt,
                    lastSyncedAt: now
                }
                counts.conflicts += 1
                continue
            }

            Object.assign(existing, fields, {
                status: 'pending_validation',
                resolution: undefined,
                updatedAt: remoteUpdatedAt,
                google: {
                    calendarId,
                    eventId: event.id,
                    ...(etag ? { etag } : {}),
                    remoteUpdatedAt,
                    lastSyncedAt: now,
                    lastSyncedLocalHash: syncedHash
                }
            })
            delete existing.deletedAt
            counts.imported += 1
        }
        if (syncToken) state.google.syncToken = syncToken
    })
}

const reconcileFullGoogleSnapshot = async (
    events: calendar_v3.Schema$Event[],
    counts: SyncCounts
): Promise<void> => {
    const remoteIds = new Set(events.map((event) => event.id).filter((id): id is string => Boolean(id)))
    await mutateCalendarState((state) => {
        for (const item of Object.values(state.items)) {
            if (!item.google || remoteIds.has(item.google.eventId)) continue
            const localChanged = item.deletedAt === undefined &&
                calendarItemSyncHash(item) !== item.google.lastSyncedLocalHash
            if (localChanged) {
                delete item.google
                counts.conflicts += 1
            } else {
                delete state.items[item.id]
                counts.deleted += 1
            }
        }
    })
}

const pushLocalChanges = async (
    calendar: calendar_v3.Calendar,
    counts: SyncCounts
): Promise<void> => {
    const itemIds = Object.keys((await readCalendarState()).items)
    for (const id of itemIds) {
        const item = (await readCalendarState()).items[id]
        if (!item) continue

        if (item.deletedAt !== undefined) {
            if (!item.google) {
                await mutateCalendarState((state) => { delete state.items[id] })
                continue
            }
            try {
                await calendar.events.delete({
                    calendarId: item.google.calendarId,
                    eventId: item.google.eventId,
                    sendUpdates: 'none'
                })
            } catch (error) {
                if (statusCode(error) !== 404 && statusCode(error) !== 410) throw error
            }
            await mutateCalendarState((state) => {
                if (state.items[id]?.deletedAt === item.deletedAt) delete state.items[id]
            })
            counts.deleted += 1
            continue
        }

        if (!isGooglePushEligible(item)) continue
        const localHash = calendarItemSyncHash(item)
        if (item.google?.lastSyncedLocalHash === localHash) continue
        const requestBody = googleEventPayloadForItem(item) as calendar_v3.Schema$Event

        try {
            const response = item.google
                ? await calendar.events.patch({
                    calendarId: item.google.calendarId,
                    eventId: item.google.eventId,
                    sendUpdates: 'none',
                    requestBody
                }, item.google.etag ? { headers: { 'If-Match': item.google.etag } } : undefined)
                : await calendar.events.insert({
                    calendarId,
                    sendUpdates: 'none',
                    requestBody
                })
            if (!response.data.id) throw new Error('Google did not return an event id.')
            const syncedAt = Date.now()
            await mutateCalendarState((state) => {
                const current = state.items[id]
                if (!current || current.deletedAt !== undefined) return
                current.google = {
                    calendarId,
                    eventId: response.data.id as string,
                    ...(response.data.etag ? { etag: response.data.etag } : {}),
                    remoteUpdatedAt: response.data.updated ? Date.parse(response.data.updated) : syncedAt,
                    lastSyncedAt: syncedAt,
                    lastSyncedLocalHash: localHash
                }
            })
            counts.pushed += 1
        } catch (error) {
            if (statusCode(error) === 412) {
                counts.conflicts += 1
                continue
            }
            if (item.google && (statusCode(error) === 404 || statusCode(error) === 410)) {
                // The event disappeared after the pull. Preserve the verified
                // local item and let the next sync recreate it with a new id.
                await mutateCalendarState((state) => {
                    if (state.items[id]) delete state.items[id].google
                })
                counts.conflicts += 1
                continue
            }
            throw error
        }
    }
}

const performSync = async (): Promise<GoogleCalendarSyncResult> => {
    const settingsBefore = await getSettings()
    if (!settingsBefore.googleCalendar.enabled) {
        throw new Error('Enable Google Calendar sync in Settings before syncing.')
    }
    if (!settingsBefore.googleCalendar.pullEnabled && !settingsBefore.googleCalendar.pushEnabled) {
        throw new Error('Enable at least one Google Calendar sync direction.')
    }

    const calendar = await authorizedCalendar()
    const counts: SyncCounts = { imported: 0, pushed: 0, deleted: 0, conflicts: 0 }

    if (settingsBefore.googleCalendar.pullEnabled) {
        const storedToken = (await readCalendarState()).google.syncToken
        let pulled: PullResult
        let fullSync = !storedToken
        try {
            pulled = await pullEvents(calendar, storedToken)
        } catch (error) {
            if (statusCode(error) !== 410 || !storedToken) throw error
            await clearGoogleSyncToken()
            pulled = await pullEvents(calendar)
            fullSync = true
        }
        await applyRemoteEvents(pulled.events, pulled.syncToken, counts)
        if (fullSync) await reconcileFullGoogleSnapshot(pulled.events, counts)
    }

    if (settingsBefore.googleCalendar.pushEnabled) {
        await pushLocalChanges(calendar, counts)
    }

    const message = [
        `${counts.imported} imported or refreshed`,
        `${counts.pushed} pushed`,
        `${counts.deleted} deleted`,
        `${counts.conflicts} latest-writer conflicts`
    ].join(', ')
    const current = await getSettings()
    const settings = await setSettings({
        googleCalendar: {
            ...current.googleCalendar,
            lastSyncAt: Date.now(),
            lastSyncStatus: 'success',
            lastSyncMessage: message
        }
    })
    return { ok: true, items: await getCalendarItems(), settings, ...counts }
}

let syncInFlight: Promise<GoogleCalendarSyncResult> | null = null

export const syncGoogleCalendar = async (): Promise<GoogleCalendarSyncResult> => {
    if (syncInFlight) return syncInFlight
    syncInFlight = performSync().catch(async (error): Promise<GoogleCalendarSyncResult> => {
        const revoked = isRevokedTokenError(error)
        if (revoked) await setGoogleRefreshToken('')
        const current = await getSettings()
        const message = revoked
            ? 'Google access expired or was revoked. Connect the account again.'
            : errorMessage(error)
        const settings = await setSettings({
            googleCalendar: {
                ...current.googleCalendar,
                ...(revoked ? { enabled: false, connectedEmail: undefined } : {}),
                lastSyncStatus: 'error',
                lastSyncMessage: message
            }
        })
        return {
            ok: false,
            error: message,
            items: await getCalendarItems(),
            settings,
            imported: 0,
            pushed: 0,
            deleted: 0,
            conflicts: 0
        }
    }).finally(() => {
        syncInFlight = null
    })
    return syncInFlight
}
