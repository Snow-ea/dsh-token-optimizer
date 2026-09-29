# DSH 0.2.0-rc.2 compatibility audit

## Scope and evidence

This note audits `dsh-token-optimizer` `0.2.2` (built against `@deepseek-ai/dsh@0.1.7-rc.2`) against `@deepseek-ai/dsh@0.2.0-rc.2` and records the adaptation shipped as `0.2.3`. It uses first-party artifacts only:

- [Official v0.2.0-rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1), whose changelog spans `dsh-v0.1.7-rc.2...dsh-v0.2.0-rc.1`, and [v0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) for the delta after it.
- The published `0.2.0-rc.2` npm artifacts for every package this plugin compiles against, plus `@deepseek-ai/dsh` and `@deepseek-ai/dsh-app-boot` for the launcher behaviour.
- A frozen `0.1.7-rc.2` installation, kept as the comparison baseline.

Method:

1. **Declaration diff** of `lib/**/*.d.ts` for all 16 plugin-facing packages, `0.1.7-rc.2` versus `0.2.0-rc.2`.
2. **Compile** of the unchanged `0.2.2` sources against the `0.2.0-rc.2` declarations.
3. **Launcher-source study** of the compatibility gate, plus a falsification matrix driven by the launcher's own exported `evaluatePluginCompatibility`.
4. **Real runtime proof**: a headless session on a genuine `0.2.0-rc.2` installation, in an isolated `$DSH_HOME`.

## Executive conclusion

**No plugin-facing declaration changed in a way this plugin can observe.** Fourteen of the sixteen audited packages are byte-identical at the `.d.ts` level, and the two that changed did so on surfaces this plugin does not reach. `0.2.2`'s source compiles and its full test suite passes **unchanged** against `0.2.0-rc.2`.

The release exists for one reason, and it is not in the plugin's code: the launcher's plugin compatibility gate **changed from fail-soft to fail-closed**, and the peer range that `0.2.2` declared no longer satisfies the runtime. Left unaddressed, `0.2.3`'s predecessor is silently refused on every `0.2.x` runtime.

## 1. The peer gate, and why `0.2.2` stops loading

`@deepseek-ai/dsh-app-boot@0.2.0-rc.2` ships `evaluatePluginCompatibility`, unchanged in contract from `0.1.7`:

```js
semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })
```

What changed is the **consequence**. In `0.1.7-rc.2` an incompatible bundle was disabled in place (the failure mode was a plugin that quietly did nothing, which §1 of the [0.1.7 audit](dsh-0.1.7-rc.2-compatibility.md) was written to warn about). In `0.2.0-rc.2` the bundle path throws:

```js
const issue = evaluatePluginCompatibility(bundleManifest, exemptions);
if (issue !== void 0 && !issue.exempted) throw new Error(pluginCompatibilityWarning(issue));
```

The CLI degrades that throw to a skip and continues booting, so the user-visible result on a `0.2.0-rc.2` runtime is:

```
dsh: skipping profile bundle "dsh-token-optimizer": Error: Plugin dsh-token-optimizer@0.2.2 is
incompatible with dsh 0.2.0-rc.2: peerDependencies {"@deepseek-ai/dsh-agent":"^0.1.5-rc.1", …}
```

`0.2.0` also adds an explicit, exact-version escape hatch — `dsh plugin allow-version`, reported by the warning as `Exact-version exemption: not active` — for users who want to accept the risk deliberately. This plugin does not rely on it: the correct fix is to declare a range that matches reality.

The arithmetic is the whole story. Against `0.2.0-rc.2`, measured with the launcher's own gate function:

| Declared peer range | 0.1.5-rc.1 | 0.1.7-rc.2 | 0.2.0-rc.1 | **0.2.0-rc.2** | 0.2.1 | 0.3.0 |
|---|---|---|---|---|---|---|
| `^0.1.5-rc.1` (`0.2.2`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `^0.2.0-rc.1` (narrow) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **`>=0.1.5-rc.1 <0.3.0`** (`0.2.3`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

A caret on a `0.x` version only ever authorises patch-level movement, so `^0.1.5-rc.1` can never reach `0.2.0` — and `includePrerelease` does not change that, because it governs prerelease comparison, not the major/minor window. The `0.1.7` note's conclusion ("widening is strictly better than narrowing") still holds, but the shape of the widening has to change: an explicit window expresses a claim the caret cannot.

`0.2.3` therefore declares `>=0.1.5-rc.1 <0.3.0` for every `@deepseek-ai/dsh*` peer. The upper bound is deliberate: `0.3.0` is unaudited, and the gate should refuse it rather than assume. The lower bound is equally deliberate — §2 shows the plugin genuinely runs on the whole range, and `0.1.7-rc.2` was the npm `latest` channel when this release was cut.

Verified two ways, on real launchers, with no warnings emitted and the optimizer row present in the composed config:

- `dsh@0.2.0-rc.2` (npm `next`) — `--profile optcheck --dump-config`
- `dsh@0.1.7-rc.2`, installed side by side — the same profile, `--dump-config`

## 2. The declaration diff: two packages, neither on this plugin's surface

Hash of the concatenated, path-sorted `lib/**/*.d.ts` per package; `IDENTICAL` means no declaration line differs at all.

| Package | Verdict | Note |
|---|---|---|
| `dsh-client-ui-conversation` | CHANGED | additive client-side submission analytics |
| `dsh-session` | CHANGED | `ToolCallRecovery` added; repair internals reshaped |
| `dsh-agent` | IDENTICAL | |
| `dsh-llm` | IDENTICAL | |
| `dsh-tools` | IDENTICAL | |
| `dsh-spill` | IDENTICAL | |
| `dsh-compaction` | IDENTICAL | |
| `dsh-compaction-basic` | IDENTICAL | |
| `dsh-session-projection` | IDENTICAL | |
| `dsh-token-meter` | IDENTICAL | |
| `dsh-home-paths` | IDENTICAL | |
| `dsh-scope` | IDENTICAL | |
| `dsh-system-prompt` | IDENTICAL | |
| `dsh-client-ui-renderer` | IDENTICAL | |
| `dsh-client-ui-session` | IDENTICAL | |
| `dsh-client-ui-slots` | IDENTICAL | |

### 2.1 `dsh-session`: the repair surface was reshaped

`interruptedTurnClosers`, `TOOL_NOT_STARTED`, and `TOOL_OUTCOME_UNKNOWN` still export, and `ToolCallRecovery` joins them. The removed lines are internal JSDoc and one reshaped helper (`OpenTurnCloseCause` selection moved behind its owners). This plugin consumes **none** of `dsh-session`'s repair surface: a repository-wide search for `interruptedTurnClosers`, `ToolCallRecovery`, and the close-cause types returns no hits in `src/` or `test/`. The one `dsh-session` API the tests touch is `snapshotEvents()` on the session — deprecated since `0.1.7` but still declared, and still compiling here.

### 2.2 `dsh-client-ui-conversation`: additive analytics

`0.2.0-rc.2` adds `MessageSubmission` / `MessageSubmissionState`, a `source` parameter on `submit`, and `reportMessageSubmission`. Every removed line in the diff is a replaced variant of an added one — a signature gaining an optional parameter, or a `locale` key block moving. The plugin's client half registers a dashboard slot and does not touch the composer submission path.

The practical proof is that **no source change was needed**: `tsc -p tsconfig.json` and `tsc -p tsconfig.test.json` both compile the untouched `0.2.2` sources cleanly against `0.2.0-rc.2`, and all 24 repository tests pass.

## 3. Upstream changes that affect the docs, not the code

- **The peer gate fails closed.** §1. Worth restating here because it is the only change in this release that alters what a user sees.
- **`0.2.0` bundles the `dsh` command with Desktop.** The desktop app now manages a `dsh` installation and plugin set from its menu bar. This is what makes a version mismatch between the desktop runtime and a separately-installed CLI observable, and why the gate's diagnostic now names `dsh plugin allow-version` as the remedy.
- **Automation tasks moved to an optional plugin bundle.** `dsh-schedule`-family behaviour is no longer in the default composition. The plugin does not interact with scheduled delivery, but its archive is session-scoped and scheduled turns create real sessions, so nothing here changes the archive layout.
- **PTC package renames landed in `0.1.7` and hold.** The plugin binds `tools/ptc-dispatch-log`, a `tools/`-namespace waterfall that is byte-identical in `0.2.0-rc.2`; it depends on no PTC package.
- **Session log format is still V4.** Confirmed in the verification run (`session.v4.jsonl.zstd`, 13 frames). The plugin reads no log files — its projection folds `SessionEvent` values and its archive is an independent directory tree.
- **`snapshotEvents`, `eventAt`, and `ownEvents` remain deprecated, not removed.** The projection test still uses `snapshotEvents()`; if a future release removes it, that assertion is the first thing to fail, which is the intended safety net.

## 4. Verification

- `pnpm install --no-frozen-lockfile` resolves the pinned closure at `0.2.0-rc.2` (`cordis@4.0.4`, `schemastery@3.18.4` unchanged). pnpm reported the three packages it auto-added to `minimumReleaseAgeExclude`; all three are now pinned there.
- `tsc -p tsconfig.json` and `tsc -p tsconfig.test.json` are clean **with no source edits**, which is what establishes §2.
- **24/24 repository tests pass** against the `0.2.0-rc.2` declarations.
- Gate matrix driven by the launcher's own `evaluatePluginCompatibility` (§1 table), reproducing the rejection of `0.2.2` and the acceptance of `0.2.3` across `0.1.5-rc.1` … `0.2.1`.
- Real launcher confirmation on both ends of the declared range: `0.1.7-rc.2` and `0.2.0-rc.2` each compose the `dsh-token-optimizer` row with no skip warning.
- **Real headless session on a genuine `0.2.0-rc.2` installation**, isolated `$DSH_HOME`, packed `0.2.3` tarball: the agent read the 16 KB `docs/dsh-0.1.7-rc.2-compatibility.md` and answered correctly (185 lines). The resulting V4 log carries exactly one `SPILL_ID: sha256:d4f0c824…43d4` replacement, the session archive holds the matching **16,012-byte** artifact for that same hash, `lineage.json` exists (proving the awaited `agent/created` handler runs under `0.2.0`), and the request envelope lists `retrieve_spill`. Full compress → archive → retrieve contract on `0.2.0-rc.2`.

## 5. Release gate checklist

- [x] Declaration diff over all 16 plugin-facing packages
- [x] Peer-gate behaviour established from the `0.2.0-rc.2` launcher source
- [x] Falsification matrix: `0.2.2` rejected on `0.2.0-rc.2`, `0.2.3` accepted across `0.1.5-rc.1` … `0.2.1`, `0.3.0` refused
- [x] Exact `0.2.0-rc.2` install and compile of source and tests with no source edits
- [x] 24/24 repository tests green against `0.2.0-rc.2`
- [x] Dual-line launcher proof on real `0.1.7-rc.2` and `0.2.0-rc.2` installs
- [x] Real headless session on a genuine `0.2.0-rc.2` install, V4 log and archive cross-checked
- [ ] Paid headless A/B benchmark re-run
- [ ] Web surface (dashboard slot) exercised on `0.2.0-rc.2`
- [ ] Live-HMR config reload re-run

## Source URL index

- Release notes 0.2.0-rc.2: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2
- Release notes 0.2.0-rc.1 (carries the 0.1.7-rc.2 delta): https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1
- Tag comparison: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.7-rc.2...dsh-v0.2.0-rc.1
- Agent boot and the compatibility gate: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/boot/app-boot
- Session repair and recovery: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/session/session
- LLM content blocks: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/llm/llm
- Compaction Basic: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/compaction/compaction-basic
- Spill policy: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/spill/spill-policy
