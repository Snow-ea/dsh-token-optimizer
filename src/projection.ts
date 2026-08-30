/** Durable, client-safe aggregate exposed by the token optimizer. */
export interface TokenOptimizerProjection {
  readonly originalChars: number
  readonly retainedChars: number
  readonly savedChars: number
  readonly savedTokens: number
  readonly compressedResults: number
  readonly spilledResults: number
  readonly compactionCount: number
  readonly compactedTokens: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    tokenOptimizer: TokenOptimizerProjection
  }

  interface SessionProjectionMap {
    tokenOptimizer: TokenOptimizerProjection
  }
}
