import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TokenOptimizerCompactionEngine from '../src/engine.js'
import { apply } from '../src/index.js'

test('engine entry defaults compaction pressure to 62.5 percent', async () => {
  const root = new Context()
  const base = root.plugin({
    apply(ctx) {
      ctx.provide('llm', {})
      ctx.provide('tokenMeter', {})
      ctx.provide('sessions', {})
    },
  })
  await base
  const engine = root.plugin(TokenOptimizerCompactionEngine, { auto: false })
  await engine
  assert.equal(root.compaction.constructor.name, 'TokenOptimizerCompactionEngine')
  assert.equal((root.compaction as TokenOptimizerCompactionEngine).config.thresholdRatio, 0.625)
  await engine.dispose()
  await base.dispose()
})

test('root engine registers an automatic pressure listener', async () => {
  const root = new Context()
  const base = root.plugin({
    apply(ctx) {
      ctx.provide('llm', {})
      ctx.provide('tokenMeter', {})
      ctx.provide('sessions', {})
    },
  })
  await base
  const engineFiber = root.plugin(TokenOptimizerCompactionEngine)
  await engineFiber

  let calls = 0
  const engine = root.compaction as TokenOptimizerCompactionEngine
  engine.compactIfNeeded = async (_agent, trigger, _signal) => {
    assert.equal(trigger, 'pressure')
    calls += 1
    return null
  }
  const agent = {} as never
  await agentEvents(root, agent).waterfall(
    'agent/pre-step',
    {
      messages: [],
      turn: 0,
      step: 0,
      signal: new AbortController().signal,
    },
    async () => ({ kind: 'enter', messages: [] }),
  )

  assert.equal(calls, 1)
  await engineFiber.dispose()
  await base.dispose()
})

test('policy startup is atomic when a compaction provider already exists', async () => {
  const root = new Context()
  const base = root.plugin({
    async apply(ctx) {
      ctx.provide('llm', {})
      ctx.provide('tokenMeter', {})
      ctx.provide('sessions', {})
      ctx.provide('compaction', {})
      ctx.provide('spillStore', { async saveText() { return { locator: 'x', bytes: 0, retrievalHint: 'x' } } })
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ProjectionRegistry)
      await ctx.plugin(ToolRuntime, {})
    },
  })
  await base
  const policy = root.plugin({
    inject: ['tools', 'sessionProjections'],
    async apply(ctx) {
      await apply(ctx, { compaction: true, auto: false })
    },
  })
  await assert.rejects(async () => await policy)
  assert.equal(root.tools.get('dsh_token_optimizer_retrieve'), undefined)
  await base.dispose()
})
