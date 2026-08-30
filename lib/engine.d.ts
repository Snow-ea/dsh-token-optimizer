import type { Context } from '@deepseek-ai/cordis';
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
/**
 * Drop-in CompactionEngine provider. BasicCompactionEngine preserves DSH's
 * replay-aware system/tools prefix and all durable compaction invariants.
 */
export declare class TokenOptimizerCompactionEngine extends BasicCompactionEngine {
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<BasicCompactionConfig>;
    constructor(ctx: Context, config?: BasicCompactionConfig);
}
export default TokenOptimizerCompactionEngine;
//# sourceMappingURL=engine.d.ts.map