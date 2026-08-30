import * as React from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ContextPressureProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter/client'
import type { TokenOptimizerProjection } from './projection.js'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'

export const inject = ['slots'] as const

type DashboardProps = PropsRuntime<'conversation.composer.dock'>

interface DashboardValues {
  readonly optimizer: TokenOptimizerProjection
  readonly usage: TokenUsageProjection | undefined
  readonly pressure: ContextPressureProjection | undefined
  readonly fallback: boolean
}

export function cacheHitPercent(usage: TokenUsageProjection | undefined): string {
  if (usage === undefined) return '--'
  const total = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  if (total <= 0) return '--'
  return `${((usage.cacheReadTokens / total) * 100).toFixed(1)}%`
}

function compactTokens(value: number): string {
  const count = Math.max(0, Math.round(value))
  if (count < 1_000) return String(count)
  if (count < 1_000_000) {
    const scaled = count / 1_000
    return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}K`
  }
  const scaled = count / 1_000_000
  return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}M`
}

export function contextPressureText(pressure: ContextPressureProjection | undefined): string {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined) return '--'
  if (pressure?.contextWindow === undefined || pressure.contextWindow <= 0) {
    return `~${compactTokens(usedTokens)}`
  }
  const percent = Math.min(100, (usedTokens / pressure.contextWindow) * 100).toFixed(1)
  return `${compactTokens(usedTokens)} / ${compactTokens(pressure.contextWindow)} (${percent}%)`
}

function integer(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

function Metric({
  label,
  value,
  title,
}: {
  label: string
  value: string
  title?: string
}): React.ReactElement {
  return React.createElement(
    'span',
    {
      ...(title === undefined ? {} : { title }),
      style: {
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        whiteSpace: 'nowrap',
      },
    },
    React.createElement(
      'span',
      { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11 } },
      label,
    ),
    React.createElement(
      'strong',
      { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 600 } },
      value,
    ),
  )
}

function TokenOptimizerDashboard(props: DashboardProps): React.ReactElement {
  const projected = props.useProjection('tokenOptimizer')
  const usage = props.useProjection('tokenUsage')
  const pressure = props.useProjection('contextPressure')
  const values: DashboardValues = {
    optimizer: projected ?? {
      originalChars: 0,
      retainedChars: 0,
      savedChars: 0,
      savedTokens: 0,
      compressedResults: 0,
      spilledResults: 0,
      compactionCount: 0,
      compactedTokens: 0,
    },
    usage,
    pressure,
    fallback: projected === undefined,
  }
  const savedTokens = values.optimizer.savedTokens + values.optimizer.compactedTokens
  const suffix = values.fallback ? ' (等待会话投影)' : ''

  return React.createElement(
    'div',
    {
      'data-dsh-token-optimizer': 'dashboard',
      title: 'dsh-token-optimizer metrics',
      style: {
        boxSizing: 'border-box',
        width: 'calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance))',
        maxWidth: 'var(--dsh-composer-card-max-width)',
        margin: '4px auto 0',
        padding: '0 4px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: '4px 12px',
        lineHeight: '18px',
      },
    },
    React.createElement(Metric, { label: 'Token 节省', value: `~${integer(savedTokens)}${suffix}` }),
    React.createElement(Metric, {
      label: '上下文',
      value: contextPressureText(values.pressure),
      title: '预计下一次请求的上下文占用；compact 后会立即重算',
    }),
    React.createElement(Metric, {
      label: '缓存命中（累计）',
      value: cacheHitPercent(values.usage),
      title: '整个会话历史请求的缓存命中率，不代表当前上下文大小',
    }),
    React.createElement(Metric, {
      label: '压缩',
      value: `${integer(values.optimizer.compressedResults)} 次`,
    }),
    React.createElement(Metric, {
      label: 'Compaction',
      value: `${integer(values.optimizer.compactionCount)} 次`,
    }),
    values.optimizer.spilledResults > 0
      ? React.createElement(Metric, {
          label: 'Spill',
          value: `${integer(values.optimizer.spilledResults)} 次`,
        })
      : null,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'dsh-token-optimizer',
        order: 20,
      },
      TokenOptimizerDashboard,
    ),
  )
}
