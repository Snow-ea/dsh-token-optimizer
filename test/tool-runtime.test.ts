import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { SpillArchive } from '../src/archive.js'
import { apply } from '../src/index.js'

async function createRuntime(): Promise<{
  readonly root: Context
  readonly policy: Context
  readonly archiveRoot: string
  readonly mirrors: string[]
  readonly dispose: () => Promise<void>
}> {
  const archiveRoot = await mkdtemp(join(tmpdir(), 'dsh-token-optimizer-test-'))
  const mirrors: string[] = []
  const root = new Context()
  const base = root.plugin({
    async apply(ctx) {
      ctx.provide('llm', {})
      ctx.provide('tokenMeter', {})
      ctx.provide('sessions', {})
      ctx.provide('spillStore', {
        async saveText(input: { content: string }) {
          mirrors.push(input.content)
          return { locator: 'backend-random', bytes: input.content.length, retrievalHint: 'unavailable in test' }
        },
      })
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(ProjectionRegistry)
      await ctx.plugin(ToolRuntime, {})
    },
  })
  await base
  const optimizer = root.plugin({
    inject: ['tools', 'sessionProjections'],
    async apply(ctx) {
      await apply(ctx, {
        compaction: false,
        smallResultChars: 3,
        largeResultChars: 10000,
        mediumHeadChars: 4096,
        mediumTailChars: 1024,
        archiveRoot,
      })
    },
  })
  await optimizer
  return {
    root,
    policy: optimizer.ctx,
    archiveRoot,
    mirrors,
    async dispose() {
      await optimizer.dispose()
      await base.dispose()
      await rm(archiveRoot, { recursive: true, force: true })
    },
  }
}

test('ToolRuntime compresses a normal accepted result and retrieve restores it', async () => {
  const runtime = await createRuntime()
  try {
    const tool = defineTool({
      name: 'optimizer_fixture',
      description: 'test fixture',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      async execute() {
        return `head\n\n\n${'repeat\n'.repeat(100)}tail`
      },
    })
    runtime.policy.tools.register(tool)
    const controller = new AbortController()
    const agent = { session: { id: 'session-test', header: {} } }
    const result = await runtime.policy.tools.execute({
      callId: 'call-test' as never,
      name: 'optimizer_fixture',
      arguments: {},
      agent: agent as never,
      signal: controller.signal,
    })

    assert.equal(result.isError, false)
    const text = result.content[0]
    assert.equal(text.type, 'text')
    assert.match(text.text, /SPILL_ID: sha256:[a-f0-9]{64}/)
    assert.match(text.text, /Content was trimmed, not lost/)
    assert.match(text.text, /\[line repeated x100\]/)
    const spillId = /SPILL_ID: (sha256:[a-f0-9]{64})/.exec(text.text)?.[1]
    assert.ok(spillId)

    const retrieve = await runtime.policy.tools.execute({
      callId: 'call-retrieve' as never,
      name: 'retrieve_spill',
      arguments: { spillId, offset: 0, limit: 200 },
      agent: agent as never,
      signal: controller.signal,
    })
    assert.equal(retrieve.isError, false)
    const retrieved = retrieve.content[0]
    assert.equal(retrieved.type, 'text')
    assert.match(retrieved.text, /repeat\nrepeat\nrepeat/)

    const reopenedArchive = new SpillArchive(runtime.archiveRoot)
    assert.match(await reopenedArchive.retrieve('session-test', undefined, spillId), /repeat\nrepeat\nrepeat/)
    assert.equal(runtime.mirrors.length, 1)
    assert.match(runtime.mirrors[0] ?? '', /repeat\nrepeat\nrepeat/)
  } finally {
    await runtime.dispose()
  }
})

test('post-execute skips a downstream value replacement', async () => {
  const runtime = await createRuntime()
  try {
    const tool = defineTool({
      name: 'value_replacement_fixture',
      description: 'test fixture',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      async execute() {
        return 'x'.repeat(200)
      },
    })
    runtime.policy.tools.register(tool)
    runtime.policy.on('tools/post-execute', async (_exec, _result, next) => {
      await next()
      return { kind: 'accept', value: 'downstream replacement' }
    })
    const result = await runtime.policy.tools.execute({
      callId: 'call-value' as never,
      name: 'value_replacement_fixture',
      arguments: {},
      signal: new AbortController().signal,
    })
    assert.equal(result.isError, false)
    assert.equal(result.content[0]?.type, 'text')
    assert.equal(result.content[0]?.text, 'downstream replacement')
  } finally {
    await runtime.dispose()
  }
})

test('post-execute preserves a failed tool result without spilling it', async () => {
  const runtime = await createRuntime()
  try {
    const tool = defineTool({
      name: 'failure_fixture',
      description: 'test fixture',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      async execute() {
        throw new Error('fixture failure '.repeat(80))
      },
    })
    runtime.policy.tools.register(tool)
    const result = await runtime.policy.tools.execute({
      callId: 'call-failure' as never,
      name: 'failure_fixture',
      arguments: {},
      agent: { session: { id: 'session-failure', header: {} } } as never,
      signal: new AbortController().signal,
    })
    assert.equal(result.isError, true)
    assert.equal(result.content[0]?.type, 'text')
    assert.doesNotMatch(result.content[0]?.text ?? '', /SPILL_ID:/)
    assert.equal(runtime.mirrors.length, 0)
  } finally {
    await runtime.dispose()
  }
})
