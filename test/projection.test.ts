import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCompressionNotice } from '../src/compression.js'
import { tokenOptimizerProjectionDefinition } from '../src/projection-host.js'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

test('token optimizer projection folds compressed tool results and compaction', () => {
  const notice = formatCompressionNotice(
    'medium',
    2400,
    1200,
    `sha256:${'c'.repeat(64)}`,
  )
  const toolEvent = {
    type: 'tool/result',
    data: {
      message: {
        content: [{
          type: 'tool-result',
          content: [{ type: 'text', text: `body\n\n${notice}` }],
        }],
      },
    },
  } as unknown as SessionEvent
  const compactionEvent = {
    type: 'compaction/summary',
    data: { shadowedTokenCount: 300 },
  } as unknown as SessionEvent

  const afterTool = tokenOptimizerProjectionDefinition.apply(
    tokenOptimizerProjectionDefinition.init(),
    toolEvent,
  )
  const afterCompaction = tokenOptimizerProjectionDefinition.apply(afterTool, compactionEvent)

  assert.equal(afterTool.compressedResults, 1)
  assert.equal(afterTool.savedChars, 1200)
  assert.equal(afterTool.savedTokens, 300)
  assert.equal(afterCompaction.compactionCount, 1)
  assert.equal(afterCompaction.compactedTokens, 300)
  assert.deepEqual(tokenOptimizerProjectionDefinition.stateSchema.parse(afterCompaction), afterCompaction)
  assert.ok(tokenOptimizerProjectionDefinition.wire)
  assert.deepEqual(tokenOptimizerProjectionDefinition.wire.view(afterCompaction), afterCompaction)
})
