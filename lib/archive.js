import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
const SPILL_ID_PATTERN = /^sha256:([a-f0-9]{64})$/;
const MAX_LINEAGE_DEPTH = 64;
export function spillIdFor(content) {
    return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}
function digestFromSpillId(spillId) {
    const match = SPILL_ID_PATTERN.exec(spillId);
    if (match === null)
        throw new Error('invalid SPILL_ID');
    return match[1];
}
function sessionKey(sessionId) {
    return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}
function errorCode(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
}
/**
 * Durable, session-authorized archive for complete pre-compression text.
 * A session-local artifact is both the content record and its authorization;
 * therefore no shared-artifact/reference two-phase commit exists.
 */
export class SpillArchive {
    root;
    constructor(root = dshHomePath('token-optimizer-spill')) {
        if (root.trim().length === 0)
            throw new Error('archiveRoot must not be blank');
        this.root = resolve(root);
    }
    sessionDir(sessionId) {
        return join(this.root, 'sessions', sessionKey(sessionId));
    }
    artifactPath(sessionId, digest) {
        return join(this.sessionDir(sessionId), 'artifacts', `${digest}.txt`);
    }
    lineagePath(sessionId) {
        return join(this.sessionDir(sessionId), 'lineage.json');
    }
    async writeAtomically(path, content) {
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
            const handle = await open(temporary, 'wx', 0o600);
            try {
                await handle.writeFile(content, 'utf8');
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            try {
                await link(temporary, path);
            }
            catch (error) {
                if (errorCode(error) !== 'EEXIST')
                    throw error;
                const existing = await readFile(path, 'utf8');
                if (existing !== content)
                    throw new Error('spill archive collision or corrupted artifact');
            }
        }
        finally {
            await unlink(temporary).catch(() => undefined);
        }
    }
    async recordSession(sessionId, parentSessionId) {
        const directory = this.sessionDir(sessionId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const lineage = { parentSessionId: parentSessionId ?? null };
        await this.writeAtomically(this.lineagePath(sessionId), JSON.stringify(lineage));
    }
    async save(ownerSessionId, parentSessionId, spillId, content) {
        const digest = digestFromSpillId(spillId);
        if (spillIdFor(content) !== spillId)
            throw new Error('SPILL_ID does not match archive content');
        await this.recordSession(ownerSessionId, parentSessionId);
        const artifactDir = join(this.sessionDir(ownerSessionId), 'artifacts');
        await mkdir(artifactDir, { recursive: true, mode: 0o700 });
        await this.writeAtomically(this.artifactPath(ownerSessionId, digest), content);
    }
    async parentOf(sessionId) {
        try {
            const raw = await readFile(this.lineagePath(sessionId), 'utf8');
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || !('parentSessionId' in parsed)) {
                throw new Error('spill archive lineage is corrupt');
            }
            const parent = parsed.parentSessionId;
            if (parent === null)
                return undefined;
            if (typeof parent !== 'string' || parent.length === 0) {
                throw new Error('spill archive lineage is corrupt');
            }
            return parent;
        }
        catch (error) {
            if (errorCode(error) === 'ENOENT')
                return undefined;
            throw error;
        }
    }
    async retrieve(ownerSessionId, parentSessionId, spillId) {
        const digest = digestFromSpillId(spillId);
        const visited = new Set();
        let candidate = ownerSessionId;
        let fallbackParent = parentSessionId;
        for (let depth = 0; candidate !== undefined && depth < MAX_LINEAGE_DEPTH; depth += 1) {
            if (visited.has(candidate))
                throw new Error('spill archive lineage contains a cycle');
            visited.add(candidate);
            try {
                const content = await readFile(this.artifactPath(candidate, digest), 'utf8');
                if (spillIdFor(content) !== spillId)
                    throw new Error('spill archive content failed integrity verification');
                return content;
            }
            catch (error) {
                if (errorCode(error) !== 'ENOENT')
                    throw error;
            }
            if (candidate === ownerSessionId && fallbackParent !== undefined) {
                candidate = fallbackParent;
                fallbackParent = undefined;
            }
            else {
                candidate = await this.parentOf(candidate);
            }
        }
        throw new Error('SPILL_ID is unavailable for this session lineage');
    }
}
//# sourceMappingURL=archive.js.map