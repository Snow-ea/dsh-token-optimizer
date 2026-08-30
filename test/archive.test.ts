import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SpillArchive, spillIdFor } from '../src/archive.js'

test('durable archive retrieves complete content after a new archive instance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-token-optimizer-archive-'))
  try {
    const original = `head\n${'middle\n'.repeat(300)}tail`
    const spillId = spillIdFor(original)
    const first = new SpillArchive(root)
    await first.save('session-a', undefined, spillId, original)

    const restarted = new SpillArchive(root)
    assert.equal(await restarted.retrieve('session-a', undefined, spillId), original)
    assert.equal(await restarted.retrieve('session-b', 'session-a', spillId), original)
    await restarted.recordSession('session-b', 'session-a')
    assert.equal(await restarted.retrieve('session-c', 'session-b', spillId), original)
    await assert.rejects(() => restarted.retrieve('session-d', undefined, spillId))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('retrieve rejects a corrupted persistent artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-token-optimizer-corrupt-'))
  try {
    const sessionId = 'session-corrupt'
    const original = 'complete original spill payload'
    const spillId = spillIdFor(original)
    await new SpillArchive(root).save(sessionId, undefined, spillId, original)
    const sessionDigest = createHash('sha256').update(sessionId, 'utf8').digest('hex')
    const artifactDigest = spillId.slice('sha256:'.length)
    await writeFile(join(root, 'sessions', sessionDigest, 'artifacts', `${artifactDigest}.txt`), 'tampered')
    await assert.rejects(() => new SpillArchive(root).retrieve(sessionId, undefined, spillId))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('concurrent saves of one SPILL_ID commit one verified artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-token-optimizer-concurrent-'))
  try {
    const original = 'same content under concurrent spill writes'
    const spillId = spillIdFor(original)
    await Promise.all(
      Array.from({ length: 8 }, () => new SpillArchive(root).save('session-concurrent', undefined, spillId, original)),
    )
    assert.equal(
      await new SpillArchive(root).retrieve('session-concurrent', undefined, spillId),
      original,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
