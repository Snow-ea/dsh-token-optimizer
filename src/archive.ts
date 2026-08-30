import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const SPILL_ID_PATTERN = /^sha256:([a-f0-9]{64})$/
const MAX_LINEAGE_DEPTH = 64

export function spillIdFor(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function digestFromSpillId(spillId: string): string {
  const match = SPILL_ID_PATTERN.exec(spillId)
  if (match === null) throw new Error('invalid SPILL_ID')
  return match[1]
}

function sessionKey(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex')
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

interface SessionLineage {
  readonly parentSessionId: string | null
}

/**
 * Durable, session-authorized archive for complete pre-compression text.
 * A session-local artifact is both the content record and its authorization;
 * therefore no shared-artifact/reference two-phase commit exists.
 */
export class SpillArchive {
  readonly root: string

  constructor(root = dshHomePath('token-optimizer-spill')) {
    if (root.trim().length === 0) throw new Error('archiveRoot must not be blank')
    this.root = resolve(root)
  }

  private sessionDir(sessionId: string): string {
    return join(this.root, 'sessions', sessionKey(sessionId))
  }

  private artifactPath(sessionId: string, digest: string): string {
    return join(this.sessionDir(sessionId), 'artifacts', `${digest}.txt`)
  }

  private lineagePath(sessionId: string): string {
    return join(this.sessionDir(sessionId), 'lineage.json')
  }

  private async writeAtomically(path: string, content: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(content, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }

      try {
        await link(temporary, path)
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error
        const existing = await readFile(path, 'utf8')
        if (existing !== content) throw new Error('spill archive collision or corrupted artifact')
      }
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }

  async recordSession(sessionId: string, parentSessionId?: string): Promise<void> {
    const directory = this.sessionDir(sessionId)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const lineage: SessionLineage = { parentSessionId: parentSessionId ?? null }
    await this.writeAtomically(this.lineagePath(sessionId), JSON.stringify(lineage))
  }

  async save(
    ownerSessionId: string,
    parentSessionId: string | undefined,
    spillId: string,
    content: string,
  ): Promise<void> {
    const digest = digestFromSpillId(spillId)
    if (spillIdFor(content) !== spillId) throw new Error('SPILL_ID does not match archive content')

    await this.recordSession(ownerSessionId, parentSessionId)
    const artifactDir = join(this.sessionDir(ownerSessionId), 'artifacts')
    await mkdir(artifactDir, { recursive: true, mode: 0o700 })
    await this.writeAtomically(this.artifactPath(ownerSessionId, digest), content)
  }

  private async parentOf(sessionId: string): Promise<string | undefined> {
    try {
      const raw = await readFile(this.lineagePath(sessionId), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || !('parentSessionId' in parsed)) {
        throw new Error('spill archive lineage is corrupt')
      }
      const parent = parsed.parentSessionId
      if (parent === null) return undefined
      if (typeof parent !== 'string' || parent.length === 0) {
        throw new Error('spill archive lineage is corrupt')
      }
      return parent
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined
      throw error
    }
  }

  async retrieve(
    ownerSessionId: string,
    parentSessionId: string | undefined,
    spillId: string,
  ): Promise<string> {
    const digest = digestFromSpillId(spillId)
    const visited = new Set<string>()
    let candidate: string | undefined = ownerSessionId
    let fallbackParent = parentSessionId

    for (let depth = 0; candidate !== undefined && depth < MAX_LINEAGE_DEPTH; depth += 1) {
      if (visited.has(candidate)) throw new Error('spill archive lineage contains a cycle')
      visited.add(candidate)

      try {
        const content = await readFile(this.artifactPath(candidate, digest), 'utf8')
        if (spillIdFor(content) !== spillId) throw new Error('spill archive content failed integrity verification')
        return content
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }

      if (candidate === ownerSessionId && fallbackParent !== undefined) {
        candidate = fallbackParent
        fallbackParent = undefined
      } else {
        candidate = await this.parentOf(candidate)
      }
    }

    throw new Error('SPILL_ID is unavailable for this session lineage')
  }
}
