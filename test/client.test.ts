import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ContextPressureProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter/client'
import { cacheHitPercent, contextPressureText } from '../src/client.js'

const cumulativeUsage: TokenUsageProjection = {
  uncachedInputTokens: 40_000,
  outputTokens: 8_000,
  cacheReadTokens: 280_000,
  cacheWriteTokens: 0,
}

const compactedPressure: ContextPressureProjection = {
  pressureTokens: 280_000,
  projectedTokens: 45_000,
  contextWindow: 128_000,
}

test('dashboard separates cumulative cache usage from compacted context pressure', () => {
  assert.equal(cacheHitPercent(cumulativeUsage), '87.5%')
  assert.equal(contextPressureText(compactedPressure), '45K / 128K (35.2%)')
})
