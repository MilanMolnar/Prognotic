import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { bearer, createTestApp, registerAndLogin, signUp, TEST_PASSWORD } from './helpers.js'

describe('auth', () => {
    it('registers a new user with email and password', async () => {
        const { app } = createTestApp()
        const response = await signUp(app, 'milan@example.com')
        expect(response.status).toBe(200)
        expect(response.body.user.email).toBe('milan@example.com')
        // The raw password must never be echoed back.
        expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD)
    })

    it('rejects a duplicate registration', async () => {
        const { app } = createTestApp()
        await signUp(app, 'milan@example.com')
        const duplicate = await signUp(app, 'milan@example.com')
        expect(duplicate.status).toBeGreaterThanOrEqual(400)
    })

    it('signs in and issues a bearer token usable for the session endpoint', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const session = await request(app).get('/api/auth/get-session').set(bearer(token))
        expect(session.status).toBe(200)
        expect(session.body.user.email).toBe('milan@example.com')
    })

    it('rejects sign-in with a wrong password', async () => {
        const { app } = createTestApp()
        await signUp(app, 'milan@example.com')
        const response = await request(app)
            .post('/api/auth/sign-in/email')
            .send({ email: 'milan@example.com', password: 'not-the-password' })
        expect(response.status).toBe(401)
    })

    it('rejects sync requests without a session', async () => {
        const { app } = createTestApp()
        const pull = await request(app).get('/api/sync')
        expect(pull.status).toBe(401)

        const push = await request(app).post('/api/sync').send({ deviceId: 'nope' })
        expect(push.status).toBe(401)
    })

    it('rejects sync requests with a garbage bearer token', async () => {
        const { app } = createTestApp()
        const pull = await request(app).get('/api/sync').set(bearer('not-a-real-token'))
        expect(pull.status).toBe(401)
    })

    it('signs out and invalidates the session token', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const signOut = await request(app).post('/api/auth/sign-out').set(bearer(token)).send({})
        expect(signOut.status).toBe(200)

        const afterSignOut = await request(app).get('/api/sync').set(bearer(token))
        expect(afterSignOut.status).toBe(401)
    })
})
