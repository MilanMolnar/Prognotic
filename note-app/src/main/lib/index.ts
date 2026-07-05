import { appDirectory, defaultSettings, excerptMaxLength, fileEncoding, goalsFileName, indexFileName, settingsFileName } from "@shared/constants"
import { AppSettings, BlockMeta, Goal } from "@shared/models"
import { AppendToBlock, CreateBlock, CreateGoal, DeleteBlock, GetBlocks, GetGoals, GetSettings, ReadBlock, SetSettings, WriteBlock } from "@shared/types"
import { randomUUID } from "crypto"
import { dialog } from "electron"
import { ensureDir, readdir, readFile, remove, rename, stat, writeFile } from "fs-extra"
import { homedir } from "os"
import welcomeNoteFile from '../../../resources/welcome-note.md?asset'


export const separator = (): string => {
  if (process.platform === 'win32')
    return "\\"
  return "/"
}
export const getRootDir = (): string => {
    return `${homedir()}${separator()}${appDirectory}`
}

const getIndexPath = (): string => `${getRootDir()}${separator()}${indexFileName}`
const getSettingsPath = (): string => `${getRootDir()}${separator()}${settingsFileName}`
const getGoalsPath = (): string => `${getRootDir()}${separator()}${goalsFileName}`
const getBlockPath = (file: string): string => `${getRootDir()}${separator()}${file}`

type BlockIndex = {
    version: number
    blocks: Record<string, BlockMeta>
}

// Serializes every index read-modify-write so concurrent IPC calls
// (editor autosave vs quick-input append) cannot interleave.
let indexLock: Promise<unknown> = Promise.resolve()
const withIndexLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = indexLock.then(task, task)
    indexLock = run.catch(() => undefined)
    return run
}

// Write to a temp file and rename over the target so a crash mid-write
// never leaves a truncated JSON file behind.
const writeJsonAtomic = async (filePath: string, data: unknown): Promise<void> => {
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: fileEncoding })
    await rename(tmpPath, filePath)
}

// Missing or corrupt index degrades to empty; getBlocks rebuilds it
// from the markdown files on disk.
const loadIndex = async (): Promise<BlockIndex> => {
    try {
        const raw = await readFile(getIndexPath(), { encoding: fileEncoding })
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.blocks && typeof parsed.blocks === 'object') {
            return { version: 1, blocks: parsed.blocks }
        }
    } catch {
        console.info('no readable block index, starting fresh')
    }
    return { version: 1, blocks: {} }
}

export const makeExcerpt = (content: string): string => {
    const firstLine = content
        .split('\n')
        .map((line) =>
            line
                .replace(/^(\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+))+/, '')
                .replace(/[*_`~]/g, '')
                .trim()
        )
        .find((line) => line.length > 0)

    if (!firstLine) return ''
    return firstLine.length > excerptMaxLength ? `${firstLine.slice(0, excerptMaxLength - 1)}…` : firstLine
}

export const getBlocks: GetBlocks = async () => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    return withIndexLock(async () => {
        const index = await loadIndex()
        let changed = false

        const fileNames = await readdir(rootDir)
        const mdFiles = new Set(fileNames.filter((fileName) => fileName.endsWith('.md')))

        // Drop index entries whose markdown file disappeared.
        for (const [id, meta] of Object.entries(index.blocks)) {
            if (!mdFiles.has(meta.file)) {
                delete index.blocks[id]
                changed = true
            }
        }

        // Absorb markdown files the index does not know about (legacy notes,
        // files dropped in by hand) as closed blocks; filenames are preserved.
        const indexedFiles = new Set(Object.values(index.blocks).map((meta) => meta.file))
        for (const file of mdFiles) {
            if (indexedFiles.has(file)) continue

            const fileStats = await stat(getBlockPath(file))
            const content = await readFile(getBlockPath(file), { encoding: fileEncoding })
            const id = randomUUID()

            index.blocks[id] = {
                id,
                file,
                // birthtime is unreliable on some filesystems, so never let
                // createdAt land after updatedAt
                createdAt: Math.min(fileStats.birthtimeMs || fileStats.mtimeMs, fileStats.mtimeMs),
                updatedAt: fileStats.mtimeMs,
                category: null,
                excerpt: makeExcerpt(content) || file.replace('.md', ''),
            }
            changed = true
        }

        // First run with no notes at all: seed a welcome block, backdated so
        // it never counts as the open block.
        if (Object.keys(index.blocks).length === 0) {
            console.info('no notes, seeding welcome block')
            const content = await readFile(welcomeNoteFile, { encoding: fileEncoding })
            const id = randomUUID()
            const file = `${id}.md`
            const backdated = Date.now() - 60 * 60 * 1000

            await writeFile(getBlockPath(file), content, { encoding: fileEncoding })
            index.blocks[id] = {
                id,
                file,
                createdAt: backdated,
                updatedAt: backdated,
                category: null,
                excerpt: makeExcerpt(content),
            }
            changed = true
        }

        if (changed) {
            await writeJsonAtomic(getIndexPath(), index)
        }

        return Object.values(index.blocks)
    })
}

export const readBlock: ReadBlock = async (id) => {
    const index = await loadIndex()
    const meta = index.blocks[id]
    if (!meta) return { content: '' }

    const content = await readFile(getBlockPath(meta.file), { encoding: fileEncoding })
    return { content }
}

export const writeBlock: WriteBlock = async (id, content) => {
    return withIndexLock(async () => {
        const index = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null

        console.info(`Writing block ${id}`)
        await writeFile(getBlockPath(meta.file), content.content, { encoding: fileEncoding })

        meta.updatedAt = Date.now()
        meta.excerpt = makeExcerpt(content.content)
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const createBlock: CreateBlock = async (content, category) => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    return withIndexLock(async () => {
        const index = await loadIndex()
        const id = randomUUID()
        const file = `${id}.md`
        const now = Date.now()

        console.info(`Creating block ${id}`)
        await writeFile(getBlockPath(file), content.content, { encoding: fileEncoding })

        const meta: BlockMeta = {
            id,
            file,
            createdAt: now,
            updatedAt: now,
            category: category ?? null,
            excerpt: makeExcerpt(content.content),
        }
        index.blocks[id] = meta
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const appendToBlock: AppendToBlock = async (id, text) => {
    return withIndexLock(async () => {
        const index = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null

        const blockPath = getBlockPath(meta.file)
        const existing = await readFile(blockPath, { encoding: fileEncoding })
        const joined = existing.trim().length === 0 ? text : `${existing.trimEnd()}\n\n${text}`

        console.info(`Appending to block ${id}`)
        await writeFile(blockPath, joined, { encoding: fileEncoding })

        meta.updatedAt = Date.now()
        meta.excerpt = makeExcerpt(joined)
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const deleteBlock: DeleteBlock = async (id) => {
    const index = await loadIndex()
    const meta = index.blocks[id]
    if (!meta) return false

    const label = meta.excerpt || new Date(meta.createdAt).toLocaleString()

    const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'delete note block',
        message: `Are you sure you want to delete "${label}"?`,
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
    })

    if (response == 1) {
        console.info("delete canceled")
        return false
    }

    console.info('deleting block')

    return withIndexLock(async () => {
        const freshIndex = await loadIndex()
        const freshMeta = freshIndex.blocks[id]
        if (!freshMeta) return false

        await remove(getBlockPath(freshMeta.file))
        delete freshIndex.blocks[id]
        await writeJsonAtomic(getIndexPath(), freshIndex)

        return true
    })
}

type GoalsFile = {
    version: number
    goals: Record<string, Goal>
}

// Missing or corrupt goals file degrades to empty.
const loadGoalsFile = async (): Promise<GoalsFile> => {
    try {
        const raw = await readFile(getGoalsPath(), { encoding: fileEncoding })
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.goals && typeof parsed.goals === 'object') {
            return { version: 1, goals: parsed.goals }
        }
    } catch {
        console.info('no readable goals file, starting fresh')
    }
    return { version: 1, goals: {} }
}

export const getGoals: GetGoals = async () => {
    await ensureDir(getRootDir())
    const goalsFile = await loadGoalsFile()
    return Object.values(goalsFile.goals)
}

export const createGoal: CreateGoal = async (name, description) => {
    await ensureDir(getRootDir())

    return withIndexLock(async () => {
        const goalsFile = await loadGoalsFile()
        const goal: Goal = {
            id: randomUUID(),
            name: name.trim(),
            description: description.trim(),
            createdAt: Date.now(),
        }

        console.info(`Creating goal ${goal.id}`)
        goalsFile.goals[goal.id] = goal
        await writeJsonAtomic(getGoalsPath(), goalsFile)

        return goal
    })
}

const clampSettings = (settings: AppSettings): AppSettings => ({
    blockWindowMinutes: Number.isFinite(settings.blockWindowMinutes)
        ? Math.max(1, Math.round(settings.blockWindowMinutes))
        : defaultSettings.blockWindowMinutes,
})

export const getSettings: GetSettings = async () => {
    try {
        const raw = await readFile(getSettingsPath(), { encoding: fileEncoding })
        return clampSettings({ ...defaultSettings, ...JSON.parse(raw) })
    } catch {
        return defaultSettings
    }
}

export const setSettings: SetSettings = async (patch) => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    const merged = clampSettings({ ...(await getSettings()), ...patch })
    await writeJsonAtomic(getSettingsPath(), merged)

    return merged
}
