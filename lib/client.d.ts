import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client';
export declare const inject: readonly ["slots"];
export declare function cacheHitPercent(usage: TokenUsageProjection | undefined): string;
export declare function contextPressureText(pressure: ContextPressureProjection | undefined): string;
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=client.d.ts.map