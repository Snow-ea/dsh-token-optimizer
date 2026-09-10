# DSH 0.1.5-rc.1 compatibility audit

## Scope and evidence

This note audits `dsh-token-optimizer` `0.2.0` (built against `@deepseek-ai/dsh@0.1.2-rc.1`) against `@deepseek-ai/dsh@0.1.5-rc.1` and records the adaptation shipped as `0.2.1`. It uses first-party artifacts only:

- [Official v0.1.5-rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1) — its own changelog compares `dsh-v0.1.2-rc.1...dsh-v0.1.5-rc.1`, so `0.1.2-rc.1` is the correct previous baseline.
- The installed `0.1.5-rc.1` npm artifacts: every `@deepseek-ai/dsh-*` package the plugin compiles against, including its shipped bundle patches and preset compositions.
- The frozen `0.1.2-rc.1` npm artifacts still recorded in `devDependencies`.

Method:

1. **Declaration diff.** For each of the 15 packages the plugin imports, concatenate `lib/**/*.d.ts` for the old and the new version and diff line-by-line. This catches renames and removals that a compile of unchanged sources would report only as errors, and it also exposes additive surface the plugin may now adopt.
2. **Compile.** Type-check the unmodified `0.2.0` sources and the test project against the `0.1.5-rc.1` declarations.
3. **Behavioural probes.** Assert that every runtime hook the plugin binds still exists and is still invoked, not merely declared.
4. **Composition probes.** Re-read the stock bundle patch and the four shipped preset compositions to confirm the ownership model the plugin relies on.

## Executive conclusion

`0.1.5-rc.1` is an additive release for this plugin: exactly **one** breaking declaration lies inside its surface, and the fix is a two-line change.

The plugin resolves every `@deepseek-ai/*` specifier through the DSH installation's shared module fallback (`$DSH_HOME/profiles/node_modules`), so at runtime it already executes against `0.1.5-rc.1` regardless of the ranges declared in its own `package.json`. `0.2.1` therefore exists to make the *declared* target match the *executed* one, and to adopt the one signature that changed.

## 1. Declaration diff

Line-level diff of the concatenated `lib/**/*.d.ts` of each package, old (`0.1.2-rc.1`) versus new (`0.1.5-rc.1`). Counts include JSDoc, so they measure churn rather than API breakage; the columns matter only where a removal lands in plugin-used surface.

| Package | removed | added | Plugin surface affected |
|---|---:|---:|---|
| `dsh-client-ui-renderer` | 0 | 0 | none |
| `dsh-client-ui-session` | 0 | 0 | none |
| `dsh-compaction` | 0 | 0 | none |
| `dsh-home-paths` | 0 | 0 | none |
| `dsh-scope` | 0 | 0 | none |
| `dsh-compaction-basic` | 5 | 5 | comments only; config fields unchanged |
| `dsh-session-projection` | 5 | 5 | JSDoc only |
| `dsh-system-prompt` | 9 | 17 | not imported by the plugin |
| `dsh-tools` | 12 | 11 | PTC event *rename* in a neighbouring namespace |
| `dsh-spill` | 6 | 13 | **breaking** |
| `dsh-agent` | 87 | 114 | none used |
| `dsh-llm` | 7 | 269 | none used |
| `dsh-session` | 211 | 141 | none used |
| `dsh-token-meter` | 107 | 110 | `TokenUsageProjection` / `ContextPressureProjection` unchanged |
| `dsh-client-ui-conversation` | 158 | 411 | `conversation.composer.dock` unchanged |

### 1.1 The one breaking change: `SpillSource` gained a discriminant

`0.1.2-rc.1` declared `SpillSource` as a single interface. `0.1.5-rc.1` declares it as a discriminated union:

```ts
export type SpillSource =
  | { kind: 'tool'; toolName: string; callId: ToolCallId; label: string }
  | { kind: 'session-reference'; sessionId: SessionId; label: string }
```

The plugin passes `SpillSource` at two call sites (`tools/post-execute` results and `tools/ptc-dispatch-log` sub-dispatch logs). Both are tool producers, so both now carry `kind: 'tool'`. Nothing else about `SaveTextSpill`, `SpillRef`, `SpillLocator`, `SpillOwner`, or `SpillStore` changed.

This is a *widening* change. Neither `0.1.2-rc.1`'s nor `0.1.5-rc.1`'s `spillStore.saveText` reads `source.kind`, so `0.2.0` keeps working at runtime on `0.1.5-rc.1`. What breaks is the contract: `0.2.0` no longer *compiles* against the `0.1.5-rc.1` declarations, so the two call sites must declare their producer kind and the declared dependency range must move with them. `0.2.1` carries no behavioural difference on either version.

### 1.2 The PTC rename does not reach this plugin

`dsh-tools` renamed the code-dispatch events `tool/code-dispatch-start` → `tool/ptc-dispatch-start` and `tool/code-dispatch` → `tool/ptc-dispatch`, and re-worded the sub-call id as opaque (`<parent>:ptc:<n>`).

The plugin binds **`tools/ptc-dispatch-log`**, a different waterfall in the `tools/` namespace, which is unchanged in both name and payload. Because the new sub-call id is documented as opaque, the plugin's treatment of `dispatch.subCallId` — pass-through into `SpillSource.callId`, never parsed — remains correct.

### 1.3 Surfaces the plugin depends on that did not change

Verified by compiling unchanged sources and by re-reading the new declarations:

- `defineTool`, `ctx.tools.register`, and the `'tools/post-execute'` waterfall with `ToolExecution` / `ToolExecutionResult` / `PostToolDecision`.
- The `'tools/ptc-dispatch-log'` waterfall and the `scopeTarget`-routed dispatch it travels on.
- `agent/created` — still emitted on every agent registration in `dsh-agent`.
- `ctx.sessionProjections.register` and the `ProjectionDefinition` shape (`key`, `stateSchema`, `stateVersion`, `init`, `apply`, `wire`).
- `BasicCompactionEngine` / `BasicCompactionConfig`: the same 11 fields (`thresholdRatio`, `retainRatio`, `retainTokens`, `summarizationProvider`, `summarizationModel`, `maxTokens`, `compactionRetries`, `maxOverflowRetries`, `modelPolicies`, `auto`, and the `Config` schema), so the plugin's re-declared loader schema still matches upstream.
- `dshHomePath` from `dsh-home-paths`.
- The Client contract: `PropsRuntime` from `dsh-client-ui-slots`, the session-scoped list slot `conversation.composer.dock` (still declared *and* still rendered by `dsh-client-ui-conversation`), the `@deepseek-ai/dsh-token-meter/client` projections, and the lazy-CJS `window.__ModuleLoader__.load({ id, factory })` artifact protocol with its `/client` subpath normalization.
- The bundle manifest contract: `dsh.bundle.patch`, `dsh.client.inject`, `dsh.client.platform`, and the `insert` patch operation.

## 2. What 0.1.5-rc.1 adds around the plugin

Two new first-party packages change the environment the plugin runs in.

### 2.1 A native spill subsystem now exists

`dsh-base` now mounts:

- `@deepseek-ai/dsh-spill-local` — a host-filesystem `ctx.spillStore` backend;
- `@deepseek-ai/dsh-spill-policy` with `maxInlineBytes: 50000` — replaces oversized tool results with a spill locator;
- `@deepseek-ai/dsh-compaction-tool-result-pruner` with `thresholdChars: 8192` / `headChars: 4096` / `tailChars: 1024`, inside the same preset isolate realm as `compaction-basic`.

The plugin's `mirrorToSpillStore` had been a documented no-op on `0.1.2-rc.1`, where no default `spillStore` existed. On `0.1.5-rc.1` that backend is present, so the mirror path is now live — and `kind: 'tool'` is precisely what makes the mirrored request valid against the new union. The durable plugin-owned archive under `dshHomePath('token-optimizer-spill')` remains the retrieval authority; the mirror is additive.

Interaction with the stock policy is unchanged in kind: the plugin's `tools/post-execute` listener declines whenever a downstream listener already replaced the result (`decision.kind !== 'accept'`, or a decision carrying `value`/`content`), so the two never double-compress the same result. No stock package registers a `retrieve_spill` tool, so the plugin's retrieval tool name stays unique.

### 2.2 The session log format moved to V3

`0.1.5-rc.1` migrates session logs from V2 to V3 and moves persistence onto a lifecycle-held `SessionHandle`; projection restore now reads a `SessionHandle.read` slice instead of an events array returned by `readFrom`.

The plugin is insensitive to both:

- Its projection is a pure fold over `SessionEvent` values handed to it by the registry, with no log-format or offset awareness.
- Its spill archive is an independent directory tree keyed by a hash of the session id; it never reads session logs.

The upgrade path is therefore a `stateVersion: 1` projection whose checkpoint is restored through the registry's new read path — covered by the projection test below.

### 2.3 Preset ownership is unchanged

Standard, PTC, and Cordis still each wrap `compaction-basic`, `command-compact`, and the tool-result pruner in a `cordis:group` carrying `isolate: { compaction: true, toolResultPruner: true }`; Minimal still ships no compaction stack. The plugin's root `CompactionEngine` plus its root pressure listener therefore keeps the `0.1.2-rc.1` behaviour verbatim: it runs before the isolated stock engine, whose 80% threshold stays a fallback, and Minimal gains automatic compaction by installation.

## 3. Adaptation shipped in 0.2.1

1. `src/index.ts` — both `saveText` mirror call sites now send `source.kind: 'tool'`.
2. `package.json` — `version` to `0.2.1`; every `@deepseek-ai/dsh-*` peer range and dev pin raised from `0.1.2-rc.1` to `0.1.5-rc.1`.
3. `pnpm-workspace.yaml` — the `overrides` and `minimumReleaseAgeExclude` pins that hold the whole DSH closure at one version move to `0.1.5-rc.1`.

No other source file changed.

## 4. Verification

- Exact `0.1.5-rc.1` dependency compile: `pnpm install` resolves the whole pinned closure at `0.1.5-rc.1`, and `tsc -p tsconfig.json` plus `tsc -p tsconfig.test.json` compile `src/**` and `test/**` with no errors.
- Full repository test suite against `0.1.5-rc.1`: 20/20 pass, including the projection-registry fold, the scoped post-execute waterfall, the PTC dispatch-log waterfall, and the atomic-compaction-provider startup test.
- Configuration composition: `dsh --profile compat --dump-config` on an isolated `$DSH_HOME` with the packed `0.2.1` tarball installed shows the `dsh-token-optimizer` bundle row applied last with its full config.
- Real headless session: a fresh `headless` profile ran `read` over the 31 KB `docs/dsh-0.1.2-rc.1-compatibility.md` and answered correctly. The resulting V3 session log carries exactly one `SPILL_ID: sha256:a0025042…3880d` replacement marker, the request envelope lists the plugin's `retrieve_spill` tool, and the session-authorised archive holds the matching 32,456-byte artifact — the full compress → archive → retrieve contract on `0.1.5-rc.1`.

### 4.1 Non-Web profiles need a compaction overlay

The optimizer bundle registers the root `ctx.compaction` provider, and `dsh-base` mounts a stock `compaction-basic` at the same root level. `dsh-web-app` disables that row (Web presets own compaction per session), which is why the Web profile loads the bundle as-is. `dsh-headless` does not, so a headless profile must stand the stock root rows down with a `--patch` overlay before the optimizer can mount — the same overlays the repository's benchmarks already use:

```yaml
- id: compaction-basic
  disabled: true
- id: tool-result-pruner
  disabled: true
```

This is **not** a `0.1.5-rc.1` regression: `@deepseek-ai/dsh-base@0.1.2-rc.1` mounts the same root rows, and the plugin's documented headless benchmark procedure has always required the overlay.

## 5. Release gate checklist

- [x] Declaration diff over all 15 plugin-facing packages
- [x] Exact `0.1.5-rc.1` pnpm install and compile of source and tests
- [x] 20/20 repository tests green against `0.1.5-rc.1`
- [x] `SpillSource` union adopted at both mirror call sites
- [x] Stock `spill-policy` / pruner / `spill-local` coexistence audited
- [x] Session V3 and `SessionHandle` impact audited — no plugin change required
- [x] Client slot and module-loader contract re-verified against `0.1.5-rc.1`
- [x] Four-preset isolate model re-verified against `0.1.5-rc.1`
- [x] Isolated-profile install of the packed tarball and `--dump-config` composition check
- [x] Real headless session proving compression, `retrieve_spill` registration, and archive recovery
- [ ] Paid headless A/B benchmark re-run
- [ ] Web live-HMR patch reload re-run

## Source URL index

- Release notes: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1
- Tag comparison: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-rc.1...dsh-v0.1.5-rc.1
- Spill: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/spill
- Spill local: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/spill/spill-local
- Spill policy: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/spill/spill-policy
- Compaction Basic: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/compaction/compaction-basic
- Tools: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/core/tools
- Session projection: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/session/session-projection
- Client modules: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.1/packages/client/modules
