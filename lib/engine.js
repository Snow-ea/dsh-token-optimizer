import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
/**
 * Drop-in CompactionEngine provider. BasicCompactionEngine preserves DSH's
 * replay-aware system/tools prefix and all durable compaction invariants.
 */
export class TokenOptimizerCompactionEngine extends BasicCompactionEngine {
    static inject = BasicCompactionEngine.inject;
    static Config = BasicCompactionEngine.Config;
    constructor(ctx, config = {}) {
        super(ctx, { ...config, thresholdRatio: config.thresholdRatio ?? 0.625 });
    }
}
export default TokenOptimizerCompactionEngine;
//# sourceMappingURL=engine.js.map