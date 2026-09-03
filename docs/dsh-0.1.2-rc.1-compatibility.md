# DSH 0.1.2-rc.1 compatibility research

## Scope and evidence

This note compares `@deepseek-ai/dsh@0.1.2-rc.1` with `0.1.1-rc.2` to guide the next `dsh-token-optimizer` compatibility release. It uses only first-party artifacts:

- [Official v0.1.2-rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1)
- [Official tag comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.1-rc.2...dsh-v0.1.2-rc.1)
- [Official v0.1.1-rc.2 tag](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2)
- [Official v0.1.2-rc.1 tag](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1)
- [npm registry metadata for 0.1.1-rc.2](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.1-rc.2)
- [npm registry metadata for 0.1.2-rc.1](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.2-rc.1)
- Published npm tarballs referenced by the two registry metadata documents, including their package source, declarations, README files, and shipped preset compositions.

The Git comparison spans 1,735 commits. Conclusions below were checked against the tagged source and the actual npm artifacts rather than inferred from commit titles. “Impact” and “recommended validation” are compatibility guidance for this plugin, not claims made by upstream.

## Executive conclusion

`0.1.2-rc.1` is an architectural compatibility boundary, not a routine version bump. The stock compaction policy remains recognizably compatible (`thresholdRatio: 0.8`, `retainRatio: 0.16`, `auto: true`), but ownership and composition changed materially:

1. Agent presets are now independently mounted standing compositions. Agents join a preset through scope parentage; agent-owned services must be isolated and must not leak into the root realm.
2. Standard, PTC, and Cordis each own an isolated stock compaction service. Minimal intentionally has no compaction stack.
3. Session access moved away from the public `Session.events` array to `seq`, `eventAt()`, and `snapshotEvents()`, with branded `SessionSeq`, `SessionSeqCursor`, and `SessionLogOffset` types.
4. Token measurement now separates route-priced node cost from route-independent heuristic shadow cost and includes routed image pricing.
5. Tool post-processing remains the spill integration point, but the pipeline is now explicitly scoped by `exec.agent`; PTC sub-dispatch persistence has a separate `tools/ptc-dispatch-log` waterfall.
6. CLI/profile delivery changed from a monolithic embedded config to ordered installable bundle patches plus configuration-tree discovery. A compatibility package must integrate through the profile bundle contract and must not assume one mutable root config file.

For `dsh-token-optimizer`, a root-level `CompactionEngine` does not replace the preset-local isolated service selected by `/compact`. It can still own automatic pressure/overflow handling: `scopeTarget` admits untagged root listeners for every scoped dispatch, while preset-tagged listeners remain limited to their scope chain. The compatibility implementation therefore keeps the root optimizer listener, verifies it with a real scope-routed agent event, leaves the isolated stock engines as manual/80% fallbacks, and explicitly documents that installing the optimizer adds automatic compaction to Minimal.

## 1. Agent presets, scope, and isolate

### Upstream API and behavior

The preset package now defines a preset as a directory containing `agent.cordis.yml` plus `preset.yml` metadata. Shipped presets live in the `@deepseek-ai/dsh-agent-presets` package; user presets live under `<DSH_HOME>/.agent-presets`. See the tagged [agent-presets package](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/preset/agent-presets) and its [Chinese reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/README.zh.md).

A preset is mounted once as a standing composition. Sessions naming that preset join it through scope parentage, so registrations and listeners apply to joined agents without applying to sibling presets. A modified preset opens a new generation for new sessions; existing sessions continue on the generation they joined. The mount suppresses Loader `write()` calls, so shared preset files are inputs, not persistence targets.

The mount audit rejects three unsafe shapes: a preset without a scope, an entry left waiting for a service never supplied by the composition, and an entry that publishes a service into the root realm. Upstream explicitly states that a service row inside a preset must be placed in a `cordis:group` with the relevant `isolate` key. See [mount.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/src/mount.ts), [composition-inventory.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/src/composition-inventory.ts), and the [scope package reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/core/scope/README.zh.md).

Preset selection is recorded in the session header and projected as `agentPreset`; changes append `agent-preset/selected`. Switching is allowed only before a session has produced content. The release notes also call out fixed retention of profile-configured preset directories and explicit broken-preset diagnostics.

### Impact on dsh-token-optimizer

- A compaction service published from a preset without `isolate: { compaction: true }` can fail preset mount audit or collide with another preset.
- A root `CompactionEngine` is not automatically the engine resolved inside a preset-local `compaction` realm. Standard/PTC/Cordis deliberately isolate their stock engine.
- Patching the shipped preset installation is not a stable integration strategy. Shipped presets are package-owned and upgrades replace them; user copies are generation snapshots and do not inherit later upstream edits.
- Plugin behavior must be agent/preset scoped. Global listeners that react to all agents without checking scoped dispatch risk cross-preset effects.

### Recommended validation

- Start two simultaneous sessions on different presets and assert that the optimizer chosen for one does not change the other.
- Load a custom preset containing the optimizer inside `cordis:group` with `isolate.compaction: true`; verify no root-service-leak or waiting-service audit failure.
- Edit the preset, create a new session, and verify old/new generations keep their respective engines.
- Confirm preset discovery reports a deliberately broken optimizer entry with a reason rather than silently hiding it.

## 2. Basic compaction engine

### Upstream API and behavior

The public policy remains: automatic pressure compaction at 80% of the routed model context window, retaining the newest 16%, one additional compaction retry, one overflow retry, and `auto: true`. `retainTokens` remains mutually exclusive with `retainRatio`; model-specific exact `{ provider, model }` overrides remain available. See [compaction-basic README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/compaction/compaction-basic/README.zh.md), [config.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/compaction/compaction-basic/src/config.ts), and [index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/compaction/compaction-basic/src/index.ts).

The engine still triggers from serial `agent/pre-step`, recovers only normalized `CONTEXT_WINDOW_EXCEEDED`, supports manual `/compact`, and optionally invokes tool-result pruning only after pressure crosses the trigger. It cannot reduce the request envelope, split an indivisible surface unit, or compact a fully closed session through `compactRegion`.

Important implementation changes:

- `compactRegion(start, end, ...)`, `CompactionResult.shadowedRange`, and `shadowedSeqs` now use branded `SessionSeq` rather than plain `number` in TypeScript.
- Region logic reads the session through `session.seq` and `session.eventAt()` rather than iterating `Session.events`.
- Shrink verification distinguishes route-priced selected tokens from heuristic tokens used by the shadow-price protocol.
- Routed adapter image pricing is included in pressure, retention, and range selection when available. The official release explicitly lists image accounting during compaction.

See [region.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/compaction/compaction-basic/src/region.ts) and [compaction types](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/compaction/compaction/src/types.ts).

### Impact on dsh-token-optimizer

- Any source-level subclass or wrapper using numeric sequence parameters must compile against `SessionSeq` and avoid arithmetic that confuses event sequence with log offset.
- Any direct `session.events` scan must migrate to `eventAt()`/`snapshotEvents()` or a projection fold.
- Custom reduction validation must compare like-for-like prices. Replacing route-priced nodes while reporting only heuristic savings can disagree with the stock meter, especially for images.
- Existing `0.625` optimizer threshold and `0.16` retention policy remain semantically expressible, but placement now matters more than values.

### Recommended validation

- Compile with the exact `0.1.2-rc.1` declarations and fail CI on unbranded sequence assumptions.
- Run pressure, manual, overflow-retry, no-open-turn, and indivisible-large-result cases.
- Add a mixed text/image history case and assert trigger/range decisions use routed image price where the adapter supplies it.
- Verify a failed summary leaves the latest persisted surface intact and does not create an unmatched replacement.
- Re-run the 256K and 1.05M token benchmarks using the same routed model metadata as production.

## 3. Token meter

### Upstream API and behavior

`ctx.tokenMeter.measure(session, requestHeader?)` remains the primary synchronous service call. Its returned `TokenMeasurement.logRevision` is now `SessionLogOffset`; each `TokenSurfaceNode.seq` is `SessionSeq`. Nodes now expose both:

- `tokens`: route-priced cost, including routed visual pricing when declared by the adapter.
- `heuristicTokens`: fixed route-independent cost used for replacement/shadow accounting.

The fold reconstructs provider output from the assistant message’s referenced chunk sequence, uses provider-reported usage only when it is at least the estimated anchor cost, and otherwise falls back conservatively to estimation. The projection family includes `tokenUsage`, `contextPressure`, and the new/current context breakdown (`systemTokens`, `toolsTokens`, `messageTokens`). See [token-meter README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/llm/token-meter/README.zh.md), [types.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/llm/token-meter/src/types.ts), [index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/llm/token-meter/src/index.ts), and [projection.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/llm/token-meter/src/projection.ts).

The release adds end-of-answer exact usage, elapsed time, and expandable statistics in the UI. That display is a consumer of projection/meter data; it is not a replacement compaction trigger API.

### Impact on dsh-token-optimizer

- Continue using `ctx.tokenMeter` as the single pressure authority. Do not duplicate the fold or infer pressure from the UI projection.
- Use `node.tokens` for routed trigger/retention/range decisions and `node.heuristicTokens` for shadow replacement accounting where the upstream protocol requires route-independent prices.
- Treat missing provider usage and missing image pricing as an estimate, not an exact count.
- If the optimizer exposes diagnostics, report the measurement baseline kind and log revision so benchmark comparisons distinguish provider usage from estimates.

### Recommended validation

- Test provider-usage, estimated, explicit-empty-provider-stream, legacy-missing-stream, and cached-input paths.
- Assert repeated `measure()` calls at the same log revision are stable.
- Verify `totalTokens`, `surfaceTokens`, and per-node route/heuristic costs remain internally consistent after optimizer replacement events.
- Compare UI context breakdown before and after optimization to the engine’s own reported shadowed tokens.

## 4. Session and projection

### Upstream API and behavior

The release explicitly replaces `Session.events` with on-demand `seq`, `eventAt()`, and `snapshotEvents()` accessors. `SessionSeq` identifies an event; `SessionLogOffset` identifies an insertion/replay offset; `SessionSeqCursor` can represent the empty-log cursor (`-1`). Upstream describes this as forward-compatible at runtime but it is a meaningful TypeScript compatibility change. See [session source](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/core/session/src) and the [official release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1).

`SessionProjectionRegistry` now formalizes pure synchronous projection units with `key`, `stateSchema`, `init`, `apply`, optional `wire`, and `stateVersion`. `snapshot(session)` returns one consistent `{ asOfSeq, values }` cut; `stateOf(session, key)` reads host state; `checkpoint`, `restoreFloor`, and `restore` use branded cursor/offset types. Projection keys are process-global: a key’s existence is not a per-session capability signal. See the [session-projection reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/session/session-projection/README.zh.md) and [registry source](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/session/session-projection/src/index.ts).

### Impact on dsh-token-optimizer

- Remove all dependence on mutable/public event arrays. Use bounded on-demand reads or a registered projection.
- Keep sequence, cursor, and offset values distinct in adapter state and serialization.
- A custom optimizer projection must return the same state/view reference for irrelevant events to avoid needless downstream work, increment `stateVersion` when fold semantics change, and expose only schema-valid JSON.
- Do not infer “optimizer active in this session” from the presence of a projection key; include an explicit per-session value.

### Recommended validation

- Replay an old `0.1.1-rc.2` JSONL session under `0.1.2-rc.1` and verify optimizer measurement and compaction selection.
- Test empty log, forked session, inherited event count, replacement events, and checkpoint restore after truncation.
- Assert no code path references `session.events` and no arithmetic mixes `SessionSeq` with `SessionLogOffset`.
- Verify projection snapshots and optimizer diagnostics share the same `asOfSeq`/revision boundary.

## 5. Tools post-execute and spill

### Upstream API and behavior

The tool pipeline is explicitly:

`tools/pre-execute` -> monotonic guards -> `tools/execute` -> `tools/post-execute` -> definition-owned `finalizeContent` -> observational `tools/result`.

`tools/post-execute` is a scoped waterfall keyed by `exec.agent`. Its `PostToolDecision` can accept, replace either content or value, append ordered `additionalContexts`, or block with feedback. Throwing in the listener produces an error result. The result is finalized after the waterfall; `tools/result` observes the frozen final result. The decision union itself is materially the same between these two tags, but scope/lifecycle and PTC persistence are now essential integration details. See [tools README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/core/tools/README.zh.md) and [tools index](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/core/tools/src/index.ts).

PTC sub-dispatch output uses a separate `tools/ptc-dispatch-log` waterfall. It may replace only the durable logged copy after the program has already received the full value; the model does not directly receive a nested sub-dispatch result. This replaces the former code-dispatch naming and is the correct spill seam for persisted PTC sub-call content.

The spill family separates three responsibilities:

- `dsh-spill`: `ctx.spillStore.saveText()` service and opaque reference contract.
- `dsh-spill-local`: private local backend and startup cleanup mechanics.
- `dsh-spill-policy`: oversized plain-text tool-result policy, producing bounded preview plus locator/instructions.

The storage service itself has no read, delete, retention, or access-control API. See [spill family](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/spill), [spill service reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/spill/spill/README.zh.md), and [local backend](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/spill/spill-local).

### Impact on dsh-token-optimizer

- `scopeTarget` admits untagged root listeners for every scoped tool dispatch and admits tagged listeners only along the agent's scope ancestry. A root result optimizer is valid, but this must be tested through the scoped carrier rather than an unscoped direct waterfall.
- Replacement must happen in the correct waterfall. Root tool results use `tools/post-execute`; PTC nested results intended only for durable logs use `tools/ptc-dispatch-log`.
- Do not mutate `result`, return both replacement `value` and `content`, or use `tools/result` for transformation.
- Preserve upstream spill references and retrieval instructions. The optimizer should compact the bounded preview/log surface, not discard the locator or claim it can retrieve through `spillStore`.
- Avoid double reduction when `dsh-spill-policy`, the stock tool-result pruner, and Token Optimizer are all installed; order and idempotence need explicit tests.

### Recommended validation

- Exercise successful, failed, blocked, content-replaced, value-replaced, and additional-context results through the optimizer.
- Run the same oversized result in native tool mode and PTC `run_code` nested dispatch; verify full PTC value reaches the program while only the durable log copy is bounded.
- Verify spill references remain usable after optimization and are scoped to the owning session/backend policy.
- Test listener disposal on preset unload/update and verify no stale cross-session policy remains.
- Test an already-spilled preview, a stock-pruned result, and an optimizer-reduced result for idempotence and stable marker parsing.

## 6. Cordis loader, bundles, and profiles

### Upstream API and behavior

`0.1.2-rc.1` standardizes application launch through named profiles. A profile is assembled from ordered `dsh.profile.bundles`, then profile `cordis.patch.yml`, home-level `cordis.patch.yml`, and optional CLI patch. Bundles declare `dsh.bundle.patch`; out-of-tree bundles are installed under the profile and resolved from its `node_modules`. Missing bundles or bundles without a declared patch fail loudly. See [bundle package map](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/bundle/README.zh.md), [app-boot reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/boot/app-boot/README.zh.md), [profile implementation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/boot/app-boot/src/profile.ts), and [CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/apps/cli/README.zh.md).

The published CLI manifest changed from including a literal `config` directory in `files` to declaring a `dsh.configTrees` contribution that mounts `config/agent-presets` from the preset package with `scanRoster: true`. This makes package-declared configuration trees part of delivery and discovery rather than assuming all configuration resides under the CLI package. The manifest also updates Cordis from `^4.0.1` to `^4.0.2`, loader from `^1.0.2` to `^1.0.3`, include from `^1.0.6` to `^1.0.7`, HMR from `^1.0.16` to `^1.0.17`, and timer from `^1.1.3` to `^1.1.4`. These facts are present in the two official npm manifests.

`mountRootInclude` registers `cordis:include` and `cordis:group` as root Loader builtins. `cordis:group` is specifically required so out-of-tree preset compositions can create an isolate realm without resolving a separate group package. Profile patch reload is `live` for Web and startup-only for other shipped profiles; custom profiles retain historical live default when omitted.

### Impact on dsh-token-optimizer

- The distribution should remain an installable profile bundle with a declared `dsh.bundle.patch`; it should not write into the CLI’s shipped `config` tree.
- Patch targets must be validated against the effective `0.1.2-rc.1` composition. The root engine intentionally does not replace isolated preset services; it contributes global automatic listeners, while preset engines remain manual/80% fallbacks.
- Bundle ordering matters. The optimizer patch should apply after the base profile rows it targets, and it must preserve the entire config object where patch semantics replace rather than merge an entry config.
- Web live patch reload and non-Web startup-only behavior require separate operational expectations.
- Loader/module resolution must be tested from an isolated profile installation, not only from the repository workspace where hoisting can hide missing dependencies.

### Recommended validation

- Install from both npm and the repository tag into a fresh profile; confirm `dsh.profile.bundles` gains exactly one optimizer bundle and resolves its declared patch.
- Run `dsh --profile <name> --dump-config` (or the current equivalent shown by the CLI help) and inspect the final compaction provider in root and preset isolate realms.
- Test Web live patch editing and Headless/ACP/SDK startup-only patch behavior.
- Remove the package and verify no mutation remains in shipped preset/package directories.
- Test pnpm-isolated resolution with no workspace root dependencies available.

### Client module and UI contract split

The `0.1.2-rc.1` Web graph no longer supplies the former `@deepseek-ai/dsh-client-runtime` package used by the optimizer's Client types. The browser runtime is now split across [client modules](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/modules), [UI renderer](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-renderer), [UI session](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-session), and [UI conversation](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-conversation). `Context` now comes from Cordis, `slots` is declared by UI Renderer, and session-scope slot props gain `sessionId` and `useProjection` through UI Session. `ConversationNode` is exported by UI Conversation. The lazy-CJS `window.__ModuleLoader__.load({ id, factory })` artifact protocol remains valid.

The optimizer must remove `dsh-client-runtime` from `dsh.client.inject`, peer dependencies, dev dependencies, source imports, and type probes. Its Client graph must instead inject Conversation, Renderer, and Session; its type-only augmentation imports must load those three contracts before resolving `PropsRuntime<'conversation.composer.dock'>`.

## 7. Four shipped agent presets

The published `@deepseek-ai/dsh-agent-presets@0.1.2-rc.1` artifact ships four presets. Their exact compositions are first-party source:

- [standard](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/presets/standard/agent.cordis.yml): full coding-agent tools, goals, plan mode, delegation/workflow/Ralph, and an isolated compaction group containing Basic, `/compact`, and tool-result pruner.
- [ptc](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/presets/ptc/agent.cordis.yml): PTC presentation (`run_code`) with the same isolated compaction group. The official release says the general-purpose `workflow` tool is no longer exposed by default in Web PTC Mode; PTC SDK capabilities stay inside `run_code`.
- [minimal](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/presets/minimal/agent.cordis.yml): complete fixed persona, runtime context suppressed, persistent shell plus `str_replace_editor`, and explicitly no context compaction. The release also removes the inapplicable `/goal` command.
- [cordis](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/preset/agent-presets/presets/cordis/agent.cordis.yml): Standard-like composition with isolated compaction plus the Cordis inspection/dynamic-plugin tool and its development skills.

### Compatibility matrix

| Preset | Stock compaction | Token Optimizer risk | Required proof |
|---|---|---|---|
| Standard | Isolated Basic + command + pruner | Root automatic listener and preset fallback can both observe pressure | Root 62.5% listener runs first; `/compact` and the isolated 80% fallback remain functional without duplicate compaction |
| PTC | Isolated Basic + command + pruner | Same dual-listener path plus nested PTC log persistence | Native outer results and `tools/ptc-dispatch-log` nested logs are bounded correctly; program values stay untouched |
| Minimal | None by design | Optimizer intentionally adds root automatic compaction | Installation documentation states the behavior; scoped pressure reaches the root listener and no preset service is leaked |
| Cordis | Isolated Basic + command + pruner | Same dual-listener path; dynamic plugin lifecycle adds disposal/update cases | Root listener, preset fallback, and Cordis dynamic-plugin lifecycle leave no stale listener/service |

## 8. Adaptation plan for dsh-token-optimizer

1. Raise development and peer ranges to exact `0.1.2-rc.1` packages used at compile time; compile against branded session types.
2. Replace removed Client Runtime types with Cordis, UI Renderer, UI Session, and UI Conversation contracts; move `ConversationNode` to its new package.
3. Replace any `Session.events` use with on-demand reads or projections and verify a real `SessionProjectionRegistry` fold.
4. Keep engine/listener ownership explicit: the root service owns global automatic listeners, while isolated preset services remain `/compact` and 80% fallbacks.
5. Explicitly document that the installed optimizer adds root automatic compaction to Minimal.
6. Continue inheriting upstream Basic so routed node pricing, heuristic shadow accounting, and image pressure changes are adopted without a second implementation.
7. Register result/spill transforms on scoped tool events and add the separate PTC durable-log handler.
8. Package the adaptation as a declared profile bundle, validate the effective config through the loader dump, then run the four-preset matrix and prior headless benchmarks before publishing.

## 9. Release gate checklist

Current `0.2.0` adaptation verification has completed: exact `0.1.2-rc.1` dependency compilation, 20 repository tests, pnpm frozen-lockfile reproduction, local tarball installation into a clean Web profile, real Chrome Client boot, healthy discovery of all four shipped presets, and real Agent creation/mount for Standard/PTC/Minimal/Cordis. Runtime instrumentation confirmed `root -> preset -> next` automatic listener order for Standard/PTC/Cordis and `root -> next` for Minimal.

The historical paid headless A/B benchmark, old on-disk `0.1.1-rc.2` JSONL replay corpus, routed image-pressure fixture, Web live-HMR update, and public npm/GitHub-tag installation remain release gates rather than claims of this adaptation pass.

- [x] Exact npm install of `@deepseek-ai/dsh@0.1.2-rc.1` in a clean profile
- [x] No writes to shipped preset directories
- [x] No preset mount audit failures or root service leaks
- [ ] Standard root optimizer runs before the isolated fallback and benchmarks pass (listener order verified; benchmark pending)
- [x] PTC outer result and nested dispatch-log waterfall behavior pass without changing input/program-visible values
- [x] Minimal's documented root automatic compaction works without a leaked preset service
- [x] Cordis dynamic-plugin lifecycle leaves no stale listener/service
- [ ] Old JSONL session replay works without `Session.events`
- [ ] Text and image pressure accounting agree with token meter
- [ ] Native spill, PTC spill, stock pruner, and optimizer are idempotent in combination
- [ ] Web live patch and non-Web startup patch behavior verified
- [ ] npm and GitHub-tag installation paths produce the same effective bundle/config

## Source URL index

- Release: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1
- Full comparison: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.1-rc.2...dsh-v0.1.2-rc.1
- npm metadata 0.1.1-rc.2: https://registry.npmjs.org/@deepseek-ai/dsh/0.1.1-rc.2
- npm metadata 0.1.2-rc.1: https://registry.npmjs.org/@deepseek-ai/dsh/0.1.2-rc.1
- Agent presets: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/preset/agent-presets
- Scope: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/core/scope
- Compaction Basic: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/compaction/compaction-basic
- Compaction core: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/compaction/compaction
- Token meter: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/llm/token-meter
- Session: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/core/session
- Session projection: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/session/session-projection
- Tools: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/core/tools
- Spill: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/spill
- Bundles: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/bundle
- App boot/profile: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/boot/app-boot
- Client modules: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/modules
- UI renderer: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-renderer
- UI session: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-session
- UI conversation: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.2-rc.1/packages/client/ui-conversation
