import '@deepseek-ai/dsh-compaction';
import '@deepseek-ai/dsh-session';
import '@deepseek-ai/dsh-session-projection';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { z } from 'zod';
import type { TokenOptimizerProjection } from './projection.js';
export declare const tokenOptimizerProjectionSchema: z.ZodObject<{
    originalChars: z.ZodNumber;
    retainedChars: z.ZodNumber;
    savedChars: z.ZodNumber;
    savedTokens: z.ZodNumber;
    compressedResults: z.ZodNumber;
    spilledResults: z.ZodNumber;
    compactionCount: z.ZodNumber;
    compactedTokens: z.ZodNumber;
}, z.core.$strip>;
export declare const tokenOptimizerProjectionDefinition: {
    key: "tokenOptimizer";
    stateSchema: z.ZodObject<{
        originalChars: z.ZodNumber;
        retainedChars: z.ZodNumber;
        savedChars: z.ZodNumber;
        savedTokens: z.ZodNumber;
        compressedResults: z.ZodNumber;
        spilledResults: z.ZodNumber;
        compactionCount: z.ZodNumber;
        compactedTokens: z.ZodNumber;
    }, z.core.$strip>;
    stateVersion: number;
    init: () => {
        originalChars: number;
        retainedChars: number;
        savedChars: number;
        savedTokens: number;
        compressedResults: number;
        spilledResults: number;
        compactionCount: number;
        compactedTokens: number;
    };
    apply: (state: NoInfer<TokenOptimizerProjection>, event: SessionEvent) => TokenOptimizerProjection;
    wire: {
        viewSchema: z.ZodObject<{
            originalChars: z.ZodNumber;
            retainedChars: z.ZodNumber;
            savedChars: z.ZodNumber;
            savedTokens: z.ZodNumber;
            compressedResults: z.ZodNumber;
            spilledResults: z.ZodNumber;
            compactionCount: z.ZodNumber;
            compactedTokens: z.ZodNumber;
        }, z.core.$strip>;
        view: (state: NoInfer<TokenOptimizerProjection>) => {
            originalChars: number;
            retainedChars: number;
            savedChars: number;
            savedTokens: number;
            compressedResults: number;
            spilledResults: number;
            compactionCount: number;
            compactedTokens: number;
        };
    };
};
//# sourceMappingURL=projection-host.d.ts.map