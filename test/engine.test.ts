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
  assert.equal(root.tools.get('retrieve_spill'), undefined)
  await base.dispose()
})

/** Mirrors the config the shipped `cordis.patch.yml` installs for this bundle. */
const BUNDLE_CONFIG = {
  compaction: true,
  thresholdRatio: 0.625,
  retainRatio: 0.16,
  auto: true,
  smallResultChars: 1200,
  largeResultChars: 12000,
  previewChars: 1000,
  mediumHeadChars: 4096,
  mediumTailChars: 1024,
} as const

async function bootOptimizer(config: Parameters<typeof apply>[1]): Promise<{
  root: Context
  dispose: () => Promise<void>
}> {
  const root = new Context()
  const base = root.plugin({
    async apply(ctx) {
      ctx.provide('llm', {})
      ctx.provide('tokenMeter', {})
      ctx.provide('sessions', {})
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
      await apply(ctx, config)
    },
  })
  await policy
  return {
    root,
    async dispose() {
      await policy.dispose()
      await base.dispose()
    },
  }
}

test('the root compaction switch is on when omitted and reaches the engine as 62.5 percent', async () => {
  const boot = await bootOptimizer({})
  try {
    const engine = boot.root.compaction as TokenOptimizerCompactionEngine | undefined
    assert.equal(engine?.constructor.name, 'TokenOptimizerCompactionEngine')
    assert.equal(engine?.config.thresholdRatio, 0.625)
  } finally {
    await boot.dispose()
  }
})

test('switching root compaction off drops the engine and keeps the retrieval tool', async () => {
  const boot = await bootOptimizer({ compaction: false })
  try {
    assert.equal(boot.root.compaction, undefined)
    assert.notEqual(boot.root.tools.get('retrieve_spill'), undefined)
  } finally {
    await boot.dispose()
  }
})

test('a switch-only override resolves the same engine as the shipped bundle config', async () => {
  const full = await bootOptimizer({ ...BUNDLE_CONFIG })
  const minimal = await bootOptimizer({ compaction: true })
  try {
    const shipped = full.root.compaction as TokenOptimizerCompactionEngine
    const override = minimal.root.compaction as TokenOptimizerCompactionEngine
    assert.equal(override.config.thresholdRatio, shipped.config.thresholdRatio)
    assert.equal(override.config.auto, shipped.config.auto)
    assert.equal(
      (override.config as { retainRatio?: number }).retainRatio,
      (shipped.config as { retainRatio?: number }).retainRatio,
    )
  } finally {
    await full.dispose()
    await minimal.dispose()
  }
})

/**
 * Companion to the compile-time schema guards in `src/index.ts`. Those guards
 * force a field upstream adds to appear in this plugin's loader schema; this
 * test forces it to also survive `compactionConfigOf` into the engine. Both
 * halves are needed: `headroomTokens` went missing from the schema *and* from
 * the forwarder, and a forgotten forwarder still type-checks because every
 * `BasicCompactionConfig` field is optional.
 */
test('every compaction policy field reaches the engine through the plugin config', async () => {
  const policy = {
    thresholdRatio: 0.5,
    headroomTokens: 4096,
    retainRatio: 0.25,
    summarizationProvider: 'policy-provider',
    summarizationModel: 'policy-model',
    maxTokens: 2048,
    compactionRetries: 3,
    maxOverflowRetries: 4,
    auto: false,
  } as const
  const modelPolicies = [{ provider: 'policy-provider', model: 'policy-model', thresholdRatio: 0.4 }]
  const boot = await bootOptimizer({ ...policy, modelPolicies })
  try {
    const engine = boot.root.compaction as TokenOptimizerCompactionEngine
    const resolved = engine.config as unknown as Record<string, unknown>
    for (const [field, expected] of Object.entries(policy)) {
      assert.equal(resolved[field], expected, `compaction field "${field}" did not reach the engine`)
    }
    assert.deepEqual(resolved.modelPolicies, modelPolicies)
  } finally {
    await boot.dispose()
  }
})
