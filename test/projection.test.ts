import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import ProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { formatCompressionNotice } from '../src/compression.js'
import { tokenOptimizerProjectionDefinition } from '../src/projection-host.js'

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

test('projection registry folds the new on-demand Session log API', async () => {
  const notice = formatCompressionNotice(
    'medium',
    2400,
    1200,
    `sha256:${'d'.repeat(64)}`,
  )
  const session = Session.create(SessionId('session-projection'))
  session.append(
    'tool/result',
    {
      turn: 0,
      step: 0,
      message: createToolResultMessage({
        callId: ToolCallId('call-projection'),
        content: [{ type: 'text', text: `body\n\n${notice}` }],
        isError: false,
      }),
    },
    { surfaceOp: 'append' },
  )

  const root = new Context()
  const registry = root.plugin(ProjectionRegistry)
  await registry
  const registration = root.plugin({
    inject: ['sessionProjections'],
    apply(ctx) {
      ctx.sessionProjections.register(tokenOptimizerProjectionDefinition)
    },
  })
  await registration

  assert.equal(session.seq, 1)
  assert.equal(session.snapshotEvents().length, 1)
  assert.equal(root.sessionProjections.stateOf(session, 'tokenOptimizer')?.savedChars, 1200)
  assert.equal(root.sessionProjections.snapshot(session).values.tokenOptimizer?.compressedResults, 1)

  await registration.dispose()
  await registry.dispose()
})
