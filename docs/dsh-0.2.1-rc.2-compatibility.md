# DSH 0.2.1-rc.2 compatibility audit

## Scope and evidence

This note audits `dsh-token-optimizer` `0.2.3` (built against `@deepseek-ai/dsh@0.2.0-rc.2`) against `@deepseek-ai/dsh@0.2.1-rc.2` and records the adaptation shipped as `0.2.4`. It uses first-party artifacts only:

- The published `0.2.1-rc.2` npm artifacts for every package this plugin compiles against, plus `@deepseek-ai/dsh` and `@deepseek-ai/dsh-app-boot` for the launcher behaviour, and `@deepseek-ai/cordis@4.0.5` / `@deepseek-ai/schemastery@3.18.5` for the runtime libraries.
- A frozen `0.2.0-rc.2` installation (`.compat-audit/probe-020`), kept as the comparison baseline.
- The running Desktop app, whose `resources/runtime/primary-runtime/runtime.json` names `desktopVersion: 0.2.1-rc.2` (nightly channel) and whose bundled CLI reports `0.2.1-rc.2`.

Method:

1. **Declaration diff** of `lib/**/*.d.ts` for all 16 plugin-facing packages, `0.2.0-rc.2` versus `0.2.1-rc.2`; the same diff for `cordis` `4.0.4 → 4.0.5` and `schemastery` `3.18.4 → 3.18.5`.
2. **Compile + test** of the unchanged `0.2.3` sources against a real `0.2.1-rc.2` `node_modules` closure.
3. **Launcher-source study** of the compatibility gate, plus a falsification matrix driven by the `0.2.1-rc.2` launcher's own exported `evaluatePluginCompatibility`.
4. **Real runtime proof**: two headless sessions on a genuine `0.2.1-rc.2` installation, in an isolated `$DSH_HOME`, covering compress → archive → retrieve.

## Executive conclusion

**No plugin-facing declaration changed in a way this plugin can observe, and no source line needed to change.** Thirteen of the sixteen audited packages differ at the `.d.ts` level, but every difference is either additive, an internal companion module, or a doc-comment rewrite; the three packages whose contracts this plugin relies on most directly — `dsh-compaction-basic`, `dsh-session-projection`, `dsh-spill` — are byte-identical. `cordis` 4.0.5 and `schemastery` 3.18.5 emit **identical** declarations to the versions `0.2.3` compiled against.

`tsc -p tsconfig.json`, `tsc -p tsconfig.test.json` and **all 24 repository tests pass on the real `0.2.1-rc.2` closure with zero source edits** — that is what establishes the claim. `0.2.4` therefore exists to re-pin the development closure (and the published peer story), not because the code changed.

The peer gate grew a second, preferred mechanism (`engines.dsh`) but its peer arithmetic — and the plugin's `>=0.1.5-rc.1 <0.3.0` window — still accept `0.2.1-rc.2` and still refuse `0.3.0`. No declaration change is required there either.

## 1. The peer gate in `0.2.1-rc.2`: `engines.dsh` joins, peer arithmetic is unchanged

`@deepseek-ai/dsh-app-boot@0.2.1-rc.2` keeps `evaluatePluginCompatibility` and the same satisfiability rule used since `0.1.7`:

```js
semver.satisfies(runtimeVersion, range, { includePrerelease: true })
```

What is new is a second requirement surface and a relocated exemption store:

- **`engines.dsh` wins when present.** If a manifest declares `engines.dsh`, that range decides alone and `peerDependencies` are ignored for gate purposes. The plugin does **not** add it: one range mechanism is easier to reason about, and the peer matrix below is the one both `0.2.0` and `0.2.1` launchers evaluate identically. (An `engines.dsh` variant was measured for completeness; it accepts the same runtime set.)
- **`workspace:^` / `workspace:~` / `workspace:*` peers** are now interpreted as "the current runtime" for peers (never for `engines.dsh`).
- **Exemptions moved to `<profile>/compatibility.json`**, read before any Cordis plugin loads; `dsh plugin allow-version` and the plugin manager write exact `name@version` grants there.
- **Retired bundles** are dropped from a stored bundle list on load (`@deepseek-ai/dsh-experimental-schedule-bundle` is the only entry today). The plugin is not in that set.
- New `official-bundles` metadata is an offline catalog for on-demand installs; it does not validate or filter profile bundles.

Measured with the `0.2.1-rc.2` launcher's own exported gate function against the shipped manifest:

| Declared peer range | 0.1.5-rc.1 | 0.1.7-rc.2 | 0.2.0-rc.2 | 0.2.1-rc.1 | **0.2.1-rc.2** | 0.2.2 | 0.3.0 |
|---|---|---|---|---|---|---|---|
| **`>=0.1.5-rc.1 <0.3.0`** (`0.2.3`, `0.2.4`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `^0.1.5-rc.1` (pre-`0.2.3`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

The upper bound stays `<0.3.0` deliberately: `0.3.0` is unaudited, so the gate should refuse it rather than assume. The lower bound stays `0.1.5-rc.1` because the plugin still runs on that whole window.

## 2. The declaration diff: thirteen packages, none on this plugin's surface

Hash of the concatenated, path-sorted `lib/**/*.d.ts` per package; `IDENTICAL` means no declaration line differs at all.

| Package | Verdict | Note |
|---|---|---|
| `dsh-compaction-basic` | IDENTICAL | the config vocabulary this plugin mirrors |
| `dsh-session-projection` | IDENTICAL | `ProjectionDefinition` / registry surface |
| `dsh-spill` | IDENTICAL | `SaveTextSpill` / `SpillRef` |
| `dsh-agent` | CHANGED | internal invariant companion only |
| `dsh-compaction` | CHANGED | internal invariant companion + doc links |
| `dsh-llm` | CHANGED | Typert remote contribution, `LlmCallControls` split, image-target additions |
| `dsh-scope` | CHANGED | internal invariant + generated resolver modules removed |
| `dsh-session` | CHANGED | plugin records, private commit internals, Typert resource map |
| `dsh-system-prompt` | CHANGED | `interpolate` / `required`, context priorities, `refreshContext` |
| `dsh-tools` | CHANGED | `ToolPresentationMode` narrowed, `PtcCalls`, waterfall-meta additions |
| `dsh-token-meter` | CHANGED | measurement checkpoint reshaped; public projections keep keys/views |
| `dsh-home-paths` | CHANGED | agent home (`DSH_AGENTS_HOME`, `~/.agents`) added |
| `cordis` `4.0.5` | IDENTICAL declarations | only the lockstep version bump |
| `schemastery` `3.18.5` | IDENTICAL declarations | only the lockstep version bump |

### 2.1 Per-package invariant companions stopped emitting public `.d.ts`

`dsh-agent`, `dsh-compaction`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-system-prompt` and `dsh-tools` each had a `lib/types/invariant.d.ts` companion exporting `name` / `inject` / `apply`. `0.2.1-rc.2` no longer ships those declarations (the companions became internal), and `dsh-scope` additionally dropped its generated resolver declarations. These are the bulk of the "removed" lines in the raw diff. **The plugin never imports any of them** — it declares its own `name` / `inject` / `apply` — so this is invisible to it; the absence is caught by the compiler only if something did import them.

### 2.2 Typert remote protocol lands, off the plugin's path

`0.2.1` introduces the Typert remote-proxy vocabulary: `dsh-llm`'s `TYPERT_REMOTE` becomes a `TypertRemoteInfo` with `llm/discoverModels`, `llm/listConfigurableProviders`, `llm/listProviders`; `dsh-session` adds a `TypertResourceMap`; the composed config gains `typert`, `typert-loader`, `typert-gateway` and `remote-access` rows. The plugin binds none of it and its request shape is unaffected.

### 2.3 `dsh-session`: experimental plugin records

`appendPluginRecord` / `pluginRecordOf`, `PluginRecordMap`, and the `plugin:${string}` type join the session API. Records are `ignorable`, never enter the model-visible surface, and survive fork/resume. Additive; the plugin's projection still folds ordinary `SessionEvent` values (`tool/result`, `compaction/summary`), whose shapes are unchanged.

### 2.4 `dsh-tools`: presentation modes narrowed, waterfalls untouched

`ToolPresentationMode` narrows from `'native' | 'ptc' | 'both'` to `'native' | 'ptc'`, and presentation projections are now persisted on `tool/ptc-dispatch` as well. The plugin never declares a presentation mode. The two waterfalls it binds are still present and still contractually identical:

- `tools/post-execute` — an `accept` decision may replace `value` **or** `content` but not both, and may not replace the value of a failed result. The plugin's guard already refuses both keys and failed results, and only ever returns `content` plus `additionalContexts`.
- `tools/ptc-dispatch-log` — still `ctx.waterfall(scopeTarget(this, dispatch.agent), …)`; the plugin's replacement return shape is unchanged.

### 2.5 `dsh-token-meter`: internal checkpoint reshaped, projections unchanged

The occupancy measurement checkpoint moves from positional `nodes[]` to surviving `systems[]` plus a scalar surface total and an armed claim, and the shadow-price protocol replaces positional pricing. The **public** projection definitions this plugin's dashboard reads — `tokenUsage` and `contextPressure` — keep their keys, state schemas and view shapes. The dashboard only consumes those views.

### 2.6 Client UI: a large additive surface

`dsh-client-ui-conversation` (+660 declaration lines) adds conversation views / render factories, remote-access hooks, queue-dock props and inline anchors; `dsh-client-ui-slots` gains `inline` anchors and a member-aware open-key hook family; `dsh-client-ui-session` adds access hooks. The plugin's client half keeps exactly what it used before, verified in the `0.2.1-rc.2` artifacts and by compiling:

- slot id `conversation.composer.dock` — still registered by `dsh-client-ui-conversation`;
- `PropsRuntime` from `dsh-client-ui-slots` — still exported with the same generic;
- projections `tokenUsage` / `contextPressure` — still declared by `dsh-token-meter`.

### 2.7 `dsh-home-paths`: the shared agent home is new

`0.2.1` adds `AGENTS_HOME_ENV` (`DSH_AGENTS_HOME`), `resolveAgentsHome`, `defaultAgentsHome` and friends, resolving `~/.agents` independently of `$DSH_HOME`. The plugin only calls `dshHomePath('token-optimizer-spill')`, which is unchanged; its archive stays under `$DSH_HOME/token-optimizer-spill`.

## 3. Upstream changes that affect the docs, not the code

- **The Nightly Desktop app moved to `0.2.1-rc.2`.** `runtime.json` records `desktopVersion: 0.2.1-rc.2`; its bundled CLI reports the same version. This audit targets exactly that runtime.
- **`dsh-headless` still disables the account/credentials rows by default.** In an isolated home the account route (`deepseek-account` + `credentials` + `authorization` + `llm-deepseek-account`) has to be re-enabled by an overlay before a headless session can talk to the model; the verification run below does that. On a normal Desktop install the account route is already active.
- **Session format is still V4.** The verification logs are `session.v4.jsonl.zstd` (13 and 16 zstd frames), and the plugin reads no log files.
- **The `0.2.0` spill policy and archive layout hold.** The optimizer's archive is its own directory tree (`sessions/<sha256("session-<id>")>/artifacts/<sha256>.txt`), independent of `dsh-spill-local` and its `maxInlineTokens` policy.

## 4. Verification

- `pnpm install` re-pins the development closure to `0.2.1-rc.2` (`cordis@4.0.5`, `schemastery@3.18.5`). pnpm's newly published-version cooldown flagged two transitive packages (`@deepseek-ai/dsh-fs`, `@deepseek-ai/dsh-working-directory`); both were added to `minimumReleaseAgeExclude`, matching the existing entries for the rest of the closure.
- `tsc -p tsconfig.json` and `tsc -p tsconfig.test.json` are clean **with no source edits**, which is what establishes §2.
- **24/24 repository tests pass** against the real `0.2.1-rc.2` `node_modules`.
- Gate matrix driven by the launcher's own `evaluatePluginCompatibility` (§1 table): `0.2.3`/`0.2.4` accepted on every runtime from `0.1.5-rc.1` through `0.2.2`, refused on `0.3.0`.
- **Isolated launcher proof**: a profile with `bundles = [dsh-base, dsh-headless, dsh-token-optimizer]` composes the `dsh-token-optimizer` row with its full config and emits **zero** `skipping profile bundle` diagnostics under `0.2.1-rc.2`.
- **Real headless session #1 (compress + archive)**: the agent read the 15,034-byte `docs/dsh-0.1.7-rc.2-compatibility.md`; the `tool/result` was replaced by the large-mode preview plus `[SPILL_ID: sha256:d4f0c824…; mode=large; original=15940; saved=14615]`. The session archive holds `sessions/8b153a54…/artifacts/d4f0c824….txt` (16,012 bytes), `lineage.json` exists (the awaited `agent/created` handler runs), the request header lists `retrieve_spill`, and the V4 log decodes to 13 frames with exactly one spill marker.
- **Real headless session #2 (retrieve round-trip)**: a second session read the same file, then called `retrieve_spill(spillId="sha256:d4f0c824…", offset=0, limit=120)` and received `Retrieved chars 0-120 of 15940` — the documented `totalChars` matches the archived original. 16 frames, one spill marker, the retrieval tool call present in the log and answered from the archive.
- Note: the verification used the `deepseek-account` route (stored platform grant). The `deepseek-official` API key present in the test home was rejected by upstream, and the OpenAI-compatible proxy route proved flaky; neither is a plugin concern, and both are recorded here only so the evidence chain is reproducible.

## 5. Release gate checklist

- [x] Declaration diff over all 16 plugin-facing packages, plus `cordis` and `schemastery`
- [x] Peer-gate behaviour established from the `0.2.1-rc.2` launcher source (including `engines.dsh` precedence)
- [x] Falsification matrix: `0.2.3`/`0.2.4` accepted `0.1.5-rc.1` … `0.2.2`, `0.3.0` refused
- [x] Exact `0.2.1-rc.2` install and compile of source and tests with no source edits
- [x] 24/24 repository tests green against `0.2.1-rc.2`
- [x] Isolated launcher composition with zero skip warnings
- [x] Real headless sessions on a genuine `0.2.1-rc.2` install: compress → archive → retrieve, V4 logs and artifacts cross-checked
- [ ] Paid headless A/B benchmark re-run
- [ ] Web surface (dashboard slot) exercised on `0.2.1-rc.2`
- [ ] Live-HMR config reload re-run

## Source URL index

- Release notes 0.2.1-rc.2: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2
- `@deepseek-ai/dsh@0.2.1-rc.2` on npm: https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.1-rc.2
- `@deepseek-ai/cordis@4.0.5`: https://www.npmjs.com/package/@deepseek-ai/cordis/v/4.0.5
- `@deepseek-ai/schemastery@3.18.5`: https://www.npmjs.com/package/@deepseek-ai/schemastery/v/3.18.5
- Agent boot and the compatibility gate: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/boot/app-boot
- Session plugin records: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/session/session
- Token meter: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/token/token-meter
- Client slots and conversation: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/client
