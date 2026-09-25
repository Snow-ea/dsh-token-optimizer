import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
import '@deepseek-ai/dsh-agent';
import '@deepseek-ai/dsh-compaction';
import '@deepseek-ai/dsh-session';
import '@deepseek-ai/dsh-session-projection';
import '@deepseek-ai/dsh-spill';
import '@deepseek-ai/dsh-tools';
export declare const name = "dsh-token-optimizer";
/** Services used by the root result policy; the nested engine declares its own core dependencies. */
export declare const inject: readonly ["tools", "sessionProjections"];
export interface TokenOptimizerConfig extends BasicCompactionConfig {
    /** Results strictly below this code-point count pass through byte-for-byte. */
    smallResultChars?: number;
    /** Results at or above this code-point count use a compact head/tail preview. */
    largeResultChars?: number;
    /** Leading context retained from a normalized medium result. */
    mediumHeadChars?: number;
    /** Trailing context retained from a normalized medium result. */
    mediumTailChars?: number;
    /** Total code-point budget for the large-result symmetric preview. */
    previewChars?: number;
    /** Persistent root for the plugin-owned, session-authorized spill archive. */
    archiveRoot?: string;
    /**
     * The one-switch control for this plugin's early compaction. `false` never
     * mounts the root `ctx.compaction` engine, so no 62.5% pressure or overflow
     * listener exists, while the tool-result policy, retrieval tool, session
     * projection, and dashboard stay active; omitted means enabled. Turning it
     * off reverts the isolated presets to the stock 80% engine DSH ships, so it
     * disables this plugin's early compaction rather than all compaction.
     */
    compaction?: boolean;
}
export interface ResolvedTokenOptimizerConfig {
    readonly smallResultChars: number;
    readonly largeResultChars: number;
    readonly mediumHeadChars: number;
    readonly mediumTailChars: number;
    readonly previewChars: number;
    readonly archiveRoot?: string;
}
/** Loader-facing schema. BasicCompactionEngine performs its cross-field checks. */
export declare const Config: z<TokenOptimizerConfig>;
export declare function resolveConfig(config?: TokenOptimizerConfig): ResolvedTokenOptimizerConfig;
export { SpillArchive, spillIdFor } from './archive.js';
export { TokenOptimizerCompactionEngine } from './engine.js';
export declare function apply(ctx: Context, config?: TokenOptimizerConfig): Promise<void>;
//# sourceMappingURL=index.d.ts.map