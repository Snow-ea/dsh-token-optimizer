import z from '@deepseek-ai/schemastery';
import '@deepseek-ai/dsh-agent';
import '@deepseek-ai/dsh-compaction';
import '@deepseek-ai/dsh-session';
import '@deepseek-ai/dsh-session-projection';
import '@deepseek-ai/dsh-spill';
import '@deepseek-ai/dsh-tools';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { SpillArchive, spillIdFor } from './archive.js';
import { buildCompressionReplacement, compressMedium, countCodePoints, headTailPreview, previewText, } from './compression.js';
import { TokenOptimizerCompactionEngine } from './engine.js';
import { tokenOptimizerProjectionDefinition } from './projection-host.js';
export const name = 'dsh-token-optimizer';
/** Services used by the root result policy; the nested engine declares its own core dependencies. */
export const inject = ['tools', 'sessionProjections'];
const DEFAULT_THRESHOLD_RATIO = 0.625;
const DEFAULT_SMALL_RESULT_CHARS = 1200;
const DEFAULT_LARGE_RESULT_CHARS = 12000;
const DEFAULT_MEDIUM_HEAD_CHARS = 4096;
const DEFAULT_MEDIUM_TAIL_CHARS = 1024;
const DEFAULT_PREVIEW_CHARS = 1000;
const RETRIEVE_TOOL_NAME = 'retrieve_spill';
/**
 * The compaction policy fields this plugin re-declares for its own loader row.
 *
 * Upstream owns this vocabulary (`CompactionPolicyConfig` in
 * `@deepseek-ai/dsh-compaction-basic`), and a schemastery schema cannot spread
 * another schema, so the plugin restates the fields. The two assertions below
 * are what keep the restatement honest: without them a field added upstream
 * would be silently dropped from this plugin's config row, which is exactly how
 * `headroomTokens` went missing between DSH 0.1.5-rc.1 and 0.1.7-rc.2.
 */
const compactionPolicyFields = {
    thresholdRatio: z.number(),
    headroomTokens: z.number().step(1).min(0),
    retainRatio: z.number(),
    retainTokens: z.number().step(1).min(0),
    summarizationProvider: z.string(),
    summarizationModel: z.string(),
    maxTokens: z.number().step(1).min(1),
    compactionRetries: z.number().step(1).min(0),
    maxOverflowRetries: z.number().step(1).min(0),
};
/**
 * Compile-time guards. Each stops compiling the moment this plugin's schema and
 * upstream's policy vocabulary disagree, in either direction, so an upstream
 * addition or removal surfaces as a build failure instead of a config row that
 * quietly ignores what a user wrote.
 */
const compactionPolicyFieldsMirrorUpstream = true;
const modelPolicyFields = {
    provider: z.string().required(),
    model: z.string().required(),
    ...compactionPolicyFields,
};
const modelPolicySchema = z.object(modelPolicyFields);
const modelPolicyFieldsMirrorUpstream = true;
/** Loader-facing schema. BasicCompactionEngine performs its cross-field checks. */
export const Config = z.object({
    ...compactionPolicyFields,
    modelPolicies: z.array(modelPolicySchema),
    auto: z.boolean(),
    smallResultChars: z.number().step(1).min(1).default(DEFAULT_SMALL_RESULT_CHARS),
    largeResultChars: z.number().step(1).min(1).default(DEFAULT_LARGE_RESULT_CHARS),
    mediumHeadChars: z.number().step(1).min(0).default(DEFAULT_MEDIUM_HEAD_CHARS),
    mediumTailChars: z.number().step(1).min(0).default(DEFAULT_MEDIUM_TAIL_CHARS),
    previewChars: z.number().step(1).min(0).default(DEFAULT_PREVIEW_CHARS),
    archiveRoot: z.string(),
    compaction: z.boolean(),
});
// Referenced so the guards survive tree-shaking review as intentional code.
void compactionPolicyFieldsMirrorUpstream;
void modelPolicyFieldsMirrorUpstream;
function assertSafeInteger(name, value, minimum) {
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`dsh-token-optimizer: ${name} must be a safe integer >= ${minimum}`);
    }
}
export function resolveConfig(config = {}) {
    const resolved = {
        smallResultChars: config.smallResultChars ?? DEFAULT_SMALL_RESULT_CHARS,
        largeResultChars: config.largeResultChars ?? DEFAULT_LARGE_RESULT_CHARS,
        mediumHeadChars: config.mediumHeadChars ?? DEFAULT_MEDIUM_HEAD_CHARS,
        mediumTailChars: config.mediumTailChars ?? DEFAULT_MEDIUM_TAIL_CHARS,
        previewChars: config.previewChars ?? DEFAULT_PREVIEW_CHARS,
        archiveRoot: config.archiveRoot,
    };
    assertSafeInteger('smallResultChars', resolved.smallResultChars, 1);
    assertSafeInteger('largeResultChars', resolved.largeResultChars, 1);
    assertSafeInteger('mediumHeadChars', resolved.mediumHeadChars, 0);
    assertSafeInteger('mediumTailChars', resolved.mediumTailChars, 0);
    assertSafeInteger('previewChars', resolved.previewChars, 0);
    if (resolved.largeResultChars <= resolved.smallResultChars) {
        throw new Error('dsh-token-optimizer: largeResultChars must be greater than smallResultChars');
    }
    if (resolved.archiveRoot !== undefined && resolved.archiveRoot.trim().length === 0) {
        throw new Error('dsh-token-optimizer: archiveRoot must not be blank');
    }
    return resolved;
}
function compactionConfigOf(config) {
    return {
        thresholdRatio: config.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO,
        ...(config.retainRatio === undefined ? {} : { retainRatio: config.retainRatio }),
        ...(config.retainTokens === undefined ? {} : { retainTokens: config.retainTokens }),
        ...(config.summarizationProvider === undefined
            ? {}
            : { summarizationProvider: config.summarizationProvider }),
        ...(config.summarizationModel === undefined
            ? {}
            : { summarizationModel: config.summarizationModel }),
        ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
        ...(config.compactionRetries === undefined
            ? {}
            : { compactionRetries: config.compactionRetries }),
        ...(config.maxOverflowRetries === undefined
            ? {}
            : { maxOverflowRetries: config.maxOverflowRetries }),
        ...(config.headroomTokens === undefined ? {} : { headroomTokens: config.headroomTokens }),
        ...(config.modelPolicies === undefined ? {} : { modelPolicies: config.modelPolicies }),
        ...(config.auto === undefined ? {} : { auto: config.auto }),
    };
}
export { SpillArchive, spillIdFor } from './archive.js';
export { TokenOptimizerCompactionEngine } from './engine.js';
function flattenText(content) {
    let text = '';
    for (const block of content) {
        if (block.type !== 'text')
            return undefined;
        text += block.text;
    }
    return text;
}
function compressionCandidate(original, resolved) {
    const originalChars = countCodePoints(original);
    if (originalChars < resolved.smallResultChars)
        return undefined;
    const mode = originalChars >= resolved.largeResultChars ? 'large' : 'medium';
    const body = mode === 'large'
        ? previewText(original, resolved.previewChars)
        : headTailPreview(compressMedium(original), resolved.mediumHeadChars, resolved.mediumTailChars);
    const spillId = spillIdFor(original);
    const replacement = buildCompressionReplacement(mode, original, body, spillId);
    return replacement === undefined ? undefined : { spillId, text: replacement.text };
}
function asRetrievedContent(content, offset, totalChars) {
    const end = Math.min(totalChars, offset + countCodePoints(content));
    const header = `Retrieved chars ${offset}-${end} of ${totalChars}.`;
    return [{ type: 'text', text: `${header}\n${content}` }];
}
function buildRetrieveTool(archive) {
    return defineTool({
        name: RETRIEVE_TOOL_NAME,
        description: 'Retrieve an exact archived spill by SPILL_ID in bounded character windows.',
        parameters: {
            spillId: {
                type: 'string',
                required: true,
                description: 'The SPILL_ID displayed by dsh-token-optimizer.',
            },
            offset: {
                type: 'integer',
                description: 'Zero-based Unicode code-point offset. Values below zero use zero.',
            },
            limit: {
                type: 'integer',
                description: 'Maximum Unicode code points to return. It is capped at 8192.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    spillId: { type: 'string', required: true },
                    content: { type: 'string', required: true },
                    offset: { type: 'integer', required: true },
                    totalChars: { type: 'integer', required: true },
                    hasMore: { type: 'boolean', required: true },
                },
            },
            render(_args, value) {
                return asRetrievedContent(value.content, value.offset, value.totalChars);
            },
        },
        async execute(args, exec) {
            exec.signal.throwIfAborted();
            const sessionId = exec.agent?.session.id;
            if (sessionId === undefined)
                throw new Error('retrieve_spill requires a session owner');
            const parentSessionId = exec.agent?.session.header.parentSession;
            const original = await archive.retrieve(String(sessionId), parentSessionId === undefined ? undefined : String(parentSessionId), args.spillId);
            exec.signal.throwIfAborted();
            const offset = Number.isSafeInteger(args.offset) && (args.offset ?? 0) >= 0 ? args.offset ?? 0 : 0;
            const requestedLimit = Number.isSafeInteger(args.limit) && (args.limit ?? 0) > 0 ? args.limit ?? 0 : 4000;
            const limit = Math.min(requestedLimit, 8192);
            const points = Array.from(original);
            const content = points.slice(offset, offset + limit).join('');
            return {
                spillId: args.spillId,
                content,
                offset,
                totalChars: points.length,
                hasMore: offset + countCodePoints(content) < points.length,
            };
        },
    });
}
async function mirrorToSpillStore(ctx, input) {
    const spillStore = ctx.get('spillStore');
    if (spillStore === undefined) {
        ctx.logger.warn('dsh-token-optimizer: no ctx.spillStore backend; durable archive remains available');
        return;
    }
    try {
        await spillStore.saveText(input);
    }
    catch (error) {
        ctx.logger.warn(`dsh-token-optimizer: ctx.spillStore mirror failed: ${String(error)}; durable archive remains available`);
    }
}
export async function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const archive = new SpillArchive(resolved.archiveRoot);
    if (config.compaction !== false) {
        const engine = ctx.plugin(TokenOptimizerCompactionEngine, compactionConfigOf(config));
        await engine;
    }
    ctx.sessionProjections.register(tokenOptimizerProjectionDefinition);
    ctx.tools.register(buildRetrieveTool(archive));
    // DSH 0.1.7-rc.2 runs `agent/created` listeners serially and holds the first
    // model request until they settle, and it types the listener as returning
    // `Promise<undefined> | undefined`. Returning the write instead of dropping it
    // both satisfies that contract and closes the race where a `retrieve_spill`
    // in the very first turn could outrun the session's lineage record. Failures
    // are still swallowed, so a broken archive can never veto agent creation.
    ctx.on('agent/created', async ({ agent }) => {
        const parentSessionId = agent.session.header.parentSession;
        try {
            await archive.recordSession(String(agent.session.id), parentSessionId === undefined ? undefined : String(parentSessionId));
        }
        catch (error) {
            ctx.logger.warn(`dsh-token-optimizer: could not record session lineage: ${String(error)}`);
        }
        return undefined;
    });
    ctx.on('tools/ptc-dispatch-log', async (dispatch, next) => {
        const content = await next();
        if (dispatch.name === RETRIEVE_TOOL_NAME)
            return content;
        const original = flattenText(content);
        const sessionId = dispatch.agent?.session.id;
        if (original === undefined || sessionId === undefined)
            return content;
        const candidate = compressionCandidate(original, resolved);
        if (candidate === undefined)
            return content;
        const parentSessionId = dispatch.agent?.session.header.parentSession;
        try {
            await archive.save(String(sessionId), parentSessionId === undefined ? undefined : String(parentSessionId), candidate.spillId, original);
        }
        catch (error) {
            ctx.logger.warn(`dsh-token-optimizer: archive save failed; keeping ${dispatch.name} PTC log inline: ${String(error)}`);
            return content;
        }
        await mirrorToSpillStore(ctx, {
            owner: { sessionId },
            source: { kind: 'tool', toolName: dispatch.name, callId: dispatch.subCallId, label: 'dispatch' },
            suggestedName: `${dispatch.name}-dispatch.txt`,
            content: original,
        });
        return [{ type: 'text', text: candidate.text }];
    });
    ctx.on('tools/post-execute', async (exec, result, next) => {
        const decision = await next();
        if (result.isError ||
            decision.kind !== 'accept' ||
            Object.hasOwn(decision, 'value') ||
            Object.hasOwn(decision, 'content') ||
            exec.parent !== undefined ||
            exec.name === RETRIEVE_TOOL_NAME) {
            return decision;
        }
        const original = flattenText(result.content);
        const sessionId = exec.agent?.session.id;
        if (original === undefined || sessionId === undefined)
            return decision;
        const candidate = compressionCandidate(original, resolved);
        if (candidate === undefined)
            return decision;
        const parentSessionId = exec.agent?.session.header.parentSession;
        try {
            await archive.save(String(sessionId), parentSessionId === undefined ? undefined : String(parentSessionId), candidate.spillId, original);
        }
        catch (error) {
            ctx.logger.warn(`dsh-token-optimizer: archive save failed; keeping ${exec.name} result inline: ${String(error)}`);
            return decision;
        }
        await mirrorToSpillStore(ctx, {
            owner: { sessionId },
            source: { kind: 'tool', toolName: exec.name, callId: exec.callId, label: 'result' },
            suggestedName: `${exec.name}.txt`,
            content: original,
        });
        exec.signal.throwIfAborted();
        return decision.additionalContexts === undefined
            ? { kind: 'accept', content: [{ type: 'text', text: candidate.text }] }
            : {
                kind: 'accept',
                content: [{ type: 'text', text: candidate.text }],
                additionalContexts: decision.additionalContexts,
            };
    });
}
//# sourceMappingURL=index.js.map