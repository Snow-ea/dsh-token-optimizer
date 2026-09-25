import '@deepseek-ai/dsh-compaction'
import '@deepseek-ai/dsh-session'
import '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { parseCompressionMarker } from './compression.js'
import type { TokenOptimizerProjection } from './projection.js'

export const tokenOptimizerProjectionSchema = z.object({
  originalChars: z.number().int().nonnegative(),
  retainedChars: z.number().int().nonnegative(),
  savedChars: z.number().int().nonnegative(),
  savedTokens: z.number().int().nonnegative(),
  compressedResults: z.number().int().nonnegative(),
  spilledResults: z.number().int().nonnegative(),
  compactionCount: z.number().int().nonnegative(),
  compactedTokens: z.number().int().nonnegative(),
})

function textFromToolResult(event: Extract<SessionEvent, { type: 'tool/result' }>): string | undefined {
  // DSH 0.1.7-rc.2 removed the `tool-result` wrapper block from `ContentBlockMap`,
  // so a `tool/result` message now carries its content blocks directly instead of
  // nesting them inside a single wrapper block.
  let text = ''
  for (const block of event.data.message.content) {
    if (block.type !== 'text') return undefined
    text += block.text
  }
  return text
}

const initialState: TokenOptimizerProjection = {
  originalChars: 0,
  retainedChars: 0,
  savedChars: 0,
  savedTokens: 0,
  compressedResults: 0,
  spilledResults: 0,
  compactionCount: 0,
  compactedTokens: 0,
}

export const tokenOptimizerProjectionDefinition = {
  key: 'tokenOptimizer',
  stateSchema: tokenOptimizerProjectionSchema,
  stateVersion: 1,
  init: () => ({ ...initialState }),
  apply: (state, event) => {
    if (event.type === 'tool/result') {
      const marker = parseCompressionMarker(textFromToolResult(event) ?? '')
      if (marker === undefined) return state
      const savedTokens = Math.floor(marker.savedChars / 4)
      return {
        ...state,
        originalChars: state.originalChars + marker.originalChars,
        retainedChars: state.retainedChars + marker.originalChars - marker.savedChars,
        savedChars: state.savedChars + marker.savedChars,
        savedTokens: state.savedTokens + savedTokens,
        compressedResults: state.compressedResults + 1,
        spilledResults: state.spilledResults + (marker.mode === 'large' ? 1 : 0),
      }
    }

    if (event.type === 'compaction/summary') {
      return {
        ...state,
        compactionCount: state.compactionCount + 1,
        compactedTokens: state.compactedTokens + event.data.shadowedTokenCount,
      }
    }

    return state
  },
  wire: {
    viewSchema: tokenOptimizerProjectionSchema,
    view: (state) => ({ ...state }),
  },
} satisfies ProjectionDefinition<'tokenOptimizer', TokenOptimizerProjection>
