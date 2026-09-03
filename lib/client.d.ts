import type { Context } from '@deepseek-ai/cordis';
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client';
export declare const inject: readonly ["slots"];
export declare function cacheHitPercent(usage: TokenUsageProjection | undefined): string;
export declare function contextPressureText(pressure: ContextPressureProjection | undefined): string;
export declare function apply(ctx: Context): void;
//# sourceMappingURL=client.d.ts.map