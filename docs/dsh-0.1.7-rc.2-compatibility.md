# DSH 0.1.7-rc.2 compatibility audit

## Scope and evidence

This note audits `dsh-token-optimizer` `0.2.1` (built against `@deepseek-ai/dsh@0.1.5-rc.1`) against `@deepseek-ai/dsh@0.1.7-rc.2` and records the adaptation shipped as `0.2.2`. It uses first-party artifacts only:

- [Official v0.1.7-rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2) and [v0.1.7-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1), whose changelog spans `dsh-v0.1.5-rc.3...dsh-v0.1.7-rc.1`. `0.1.6` never left the alpha channel, so `0.1.5-rc.3` → `0.1.7-rc.1` is the real delta.
- The published `0.1.7-rc.2` npm artifacts for every package this plugin compiles against, plus `@deepseek-ai/dsh` and `@deepseek-ai/dsh-app-boot` for the launcher behaviour.
- The frozen `0.1.5-rc.1` artifacts still referenced by `0.2.1`.

Method:

1. **Declaration diff** of `lib/**/*.d.ts` for all 16 plugin-facing packages, `0.1.5-rc.1` versus `0.1.7-rc.2`.
2. **Compile** of the unchanged `0.2.1` sources against the `0.1.7-rc.2` declarations.
3. **Launcher-source study** of the compatibility gate `0.1.7-rc.1` introduces, plus an empirical semver matrix using the exact call that gate makes.
4. **Real runtime proof**: a headless session on a genuine `0.1.7-rc.2` installation, in an isolated `$DSH_HOME`.

## Executive conclusion

`0.1.7-rc.2` reaches further into this plugin than `0.1.5-rc.1` did: two declarations it depends on actually changed shape, and one upstream config field was added that its own loader schema had to mirror. All three are now fixed.

The headline risk, however, was not in the plugin's code. `0.1.7-rc.1` introduced a **plugin/DSh version gate that silently disables a row** when a plugin's `@deepseek-ai/dsh*` peer ranges do not match the running version. The plugin survives it — but only because the gate's semver call is more permissive than it looks, which is worth recording precisely.

## 1. The peer gate, and why 0.2.1 keeps working

`@deepseek-ai/dsh-app-boot@0.1.7-rc.2` ships `evaluatePluginCompatibility`, which reads a plugin's `peerDependencies` and tests **every `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` entry** against the running version with:

```js
semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })
```

`includePrerelease: true` is decisive. Standard node-semver refuses to match a prerelease against a range whose prerelease sits on a different `major.minor.patch` tuple; with the flag, prereleases are compared numerically. Measured with `semver@7.8.5`, the library the launcher itself depends on:

| Plugin peer range | 0.1.5-rc.1 | 0.1.5-rc.3 | 0.1.7-alpha.2 | 0.1.7-rc.1 | 0.1.7-rc.2 |
|---|---|---|---|---|---|
| `^0.1.5-rc.1` **with** `includePrerelease` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `^0.1.7-rc.1` **with** `includePrerelease` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `^0.1.5-rc.1` **without** the flag | ✅ | ✅ | ❌ | ❌ | ❌ |

The last row is what a naive reading predicts, and it is wrong: third-party compatibility checkers that "strip the prerelease and compare numeric windows" report `^0.1.5-rc.1` as incompatible with `0.1.7-rc.2`. Against the real gate it is compatible.

Two consequences shape this release:

1. **The declared peer range stays `^0.1.5-rc.1`.** Narrowing it to `^0.1.7-rc.1` would make the bundle *refuse to load* on `0.1.5-rc.3`, which is still the npm `latest` channel. Widening is strictly better than narrowing here, and §3 shows the plugin's code genuinely runs on both.
2. A row that fails the gate **gains `disabled` and is not replaced by an error** — the failure mode is a plugin that quietly does nothing. That is why this section is longer than the code changes it protects.

The gate only inspects `@deepseek-ai/dsh*` names, so `@deepseek-ai/cordis` is never a refusal cause.

## 2. The two real breakages

Both were found by compiling unchanged `0.2.1` sources against the new declarations, and both are in the plugin's runtime path rather than its types.

### 2.1 `tool-result` left `ContentBlockMap`

`0.1.5-rc.1` wrapped a tool result in a dedicated block:

```ts
// 0.1.5-rc.1
export interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock      // ← wrapper with its own .content
}
```

`0.1.7-rc.2` deletes that entry. A `tool/result` message now carries content blocks **directly**, and the map has grown `tool-addition` and `tool-removal` instead:

```ts
// 0.1.7-rc.2
export interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-addition': ToolAdditionBlock
  'tool-removal': ToolRemovalBlock
}
```

`projection-host.ts` reached through the retired wrapper (`event.data.message.content[0].content`) when folding the token-optimizer projection, so the fold silently stopped matching. The fix iterates `message.content` directly. The regression test's hand-rolled fixture used the same retired wrapper and had to be rebuilt with `createToolResultMessage`, which is why the suite caught it.

### 2.2 `agent/created` became asynchronous and serial

`0.1.7` replaces `agent/session-start` with a serial `agent/created` whose listeners are **awaited before the first model request**, and retypes the listener as returning `Promise<undefined> | undefined`. The `0.2.1` handler returned `void` from a fire-and-forget body, which no longer type-checks.

The plugin now awaits its session-lineage write inside a `try`/`catch` and returns `undefined`. That satisfies the contract, closes a real race (a `retrieve_spill` in the very first turn could previously outrun the lineage record), and still cannot veto agent creation because every failure is swallowed and logged.

## 3. Sync gaps and the guard that closes them

`dsh-compaction-basic@0.1.7-rc.2` adds one field to its policy vocabulary:

```ts
export interface CompactionPolicyConfig {
  thresholdRatio?: number
  /** Additional pressure headroom beyond the routed output reservation. Non-negative integer; defaults to `65536`. */
  headroomTokens?: number
  …
}
```

The plugin restates this vocabulary in its own loader schema, and `0.2.1` restated the old one — so `headroomTokens` was absent from both the schema and the engine forwarder. The root cause is structural, not clerical: a schemastery schema cannot spread another schema, so restating is unavoidable, and nothing forced the restatement to stay current.

`0.2.2` removes the drift class rather than the instance:

- The policy fields are declared once in a `compactionPolicyFields` dict that both the default-policy schema and the per-model `modelPolicies` schema spread.
- Two compile-time assertions compare that dict's key set against upstream's `CompactionPolicyConfig` and `ModelCompactPolicyConfig` **in both directions**. A field upstream adds — or removes — now fails the build with `Type 'true' is not assignable to type 'never'` at a self-describing const name. This was verified by deleting `headroomTokens` from the dict and confirming both assertions fire.
- A round-trip test applies a config carrying every policy field and asserts each one reaches the engine's resolved config, covering the second half of the same bug: a forgotten forwarder still type-checks, because every `BasicCompactionConfig` field is optional.

Also aligned: `@deepseek-ai/cordis` dev pin `4.0.2` → `4.0.4` (the version `0.1.7-rc.2` ships and its packages peer-require), `@deepseek-ai/schemastery` `^3.18.2` → `^3.18.4` (every `0.1.7-rc.2` package depends on `~3.18.4`), and the `pnpm-workspace.yaml` overrides. Three override names had to be retargeted because their packages were renamed or retired upstream: `dsh-code-runtime` → `dsh-ptc-runtime`, `dsh-agent-presets` → `dsh-agent-preset` + `dsh-agent-preset-registry`, and `dsh-host-apiproxy` → dropped (superseded by the `dsh-api-*-controller` family).

## 4. New 0.1.7 features

### 4.1 Adopted: Plugin Manager display metadata

`0.1.7` lets a bundle declare an `icon` and localized titles/descriptions, read through the Node ESM resolver without evaluating plugin code. `0.2.2` follows the exact convention the shipped optional bundles use:

- `"icon": "./icon.svg"` — manifest-relative, inside the package, at most 256 KiB (this icon is 818 bytes).
- `locale/en.json` and `locale/zh.json`, each `{ "meta": { "title", "description" } }`.
- `"./locale/*.json": "./locale/*.json"` added to `exports`, which is what makes those files resolvable.

Verified by resolving the manifest, both dictionaries, and the icon from the installed profile exactly as `readPluginMeta` does.

### 4.2 Not adopted: live-updating (`volatile`) config fields

`schemastery@3.18.4` adds `schema.volatile()`, which turns a field into a stable `{ get() }` reference so a config change updates the running instance instead of recreating it. This plugin deliberately does **not** use it yet:

- It would change the public config contract from `number` to `Volatile<number>`, forcing every read onto the hot path and making the engine accept both plain values and references — a dual-shape config that is hard to reason about and easy to rot.
- Programmatic callers (`ctx.plugin(Engine, { thresholdRatio })`, every test) pass plain objects today.
- No core DSH plugin uses it, so there is no in-tree pattern to copy.
- The payoff is convenience only: without it, a config edit re-applies the plugin, which is standard Cordis behaviour and fully functional.

Revisit if DSH's own plugins adopt it and a shared idiom exists.

### 4.3 Not needed: multi-file bundle patches and `--dump-config-schema`

`dsh.bundle.patch` now accepts an **array** of patch files, applied in order; single-string declarations still work and this bundle keeps one file. `dsh --dump-config-schema` now exports a JSON Schema for composed config and patches — useful for hand-authoring, unused by a bundle that owns one small config row.

## 5. Upstream changes that affect the docs, not the code

- **Agent presets moved into bundles.** `@deepseek-ai/dsh-agent-presets` is not published past `0.1.6-alpha.2`; the four shipped presets now arrive as extra patch layers inside `@deepseek-ai/dsh-web-app`, declared through the new array form of `dsh.bundle.patch`. Their composition is otherwise unchanged: standard, PTC, and cordis still wrap `compaction-basic`, `command-compact`, and the tool-result pruner in a group carrying `isolate: { compaction: true, toolResultPruner: true }`, and minimal still ships no compaction stack. The root-engine-plus-isolated-fallback model this plugin relies on therefore still holds — only the file locations moved.
- **Stock spill policy switched to tokens.** `dsh-spill-policy` is now configured with `maxInlineTokens: 12500`, replacing `maxInlineBytes: 50000`. The plugin's own thresholds are character-based and independent, and its `tools/post-execute` listener still declines whenever a downstream listener already replaced the result, so the two still cannot double-compress one result. Custom `spill-policy` overrides must use the new key.
- **Session logs are V4.** Confirmed in the verification run (`session.v4.jsonl.zstd`). The plugin reads no log files: its projection folds `SessionEvent` values and its archive is an independent directory tree, so the format version is invisible to it.
- **PTC → `ptc-runtime` renames removed the legacy aliases.** The plugin binds `tools/ptc-dispatch-log`, a `tools/`-namespace waterfall that is unchanged; it depends on no PTC package. The retired names in the diff (`CodeSdkLanguage`, `requireCodeTransport`, `requireCodeRuntime`) are internal to `dsh-tools`.
- **`snapshotEvents`, `eventAt`, and `ownEvents` are deprecated.** The plugin uses none of them.
- **Session history APIs and the settings service were rewritten**; neither is on this plugin's surface.

## 6. Verification

- `pnpm install` resolves the pinned closure at `0.1.7-rc.2` with `cordis@4.0.4` and `schemastery@3.18.4`.
- `tsc -p tsconfig.json` and `tsc -p tsconfig.test.json` are clean, which is what surfaced both §2 breakages.
- **24/24 repository tests pass**, including the new policy round-trip test, the rebuilt projection fixture, and the six engine tests covering the `compaction` switch.
- The drift assertions were falsified on purpose: deleting `headroomTokens` from the schema dict fails the build in both guards.
- `--dump-config` on a genuine `0.1.7-rc.2` installation in an isolated `$DSH_HOME` composes the `dsh-token-optimizer` bundle row with its full config.
- A real headless session on that installation read a 13 KB file and answered correctly. The resulting **V4** log carries exactly one `SPILL_ID: sha256:e5145479…6af6` replacement, the session-authorised archive holds the matching 14,091-byte artifact, the request envelope lists `retrieve_spill`, and `lineage.json` exists — proving the rewritten `agent/created` handler records lineage under the new awaited contract.
- Plugin Manager metadata resolves from the installed profile: manifest, both locale dictionaries, and the 818-byte icon.

## 7. Release gate checklist

- [x] Declaration diff over all 16 plugin-facing packages
- [x] Peer-gate behaviour established from the launcher source and confirmed with an empirical semver matrix
- [x] Exact `0.1.7-rc.2` install and compile of source and tests
- [x] 24/24 repository tests green against `0.1.7-rc.2`
- [x] `tool-result` wrapper removal adapted and covered by a faithful fixture
- [x] `agent/created` async-serial contract adopted
- [x] `headroomTokens` mirrored, with two compile-time drift assertions and a round-trip test
- [x] Plugin Manager locale and icon metadata adopted and resolution-verified
- [x] Preset ownership model re-verified against the relocated `0.1.7` preset patches
- [x] Real headless session on a genuine `0.1.7-rc.2` install, V4 log and archive cross-checked
- [ ] Paid headless A/B benchmark re-run
- [ ] Web surface (dashboard slot) exercised on `0.1.7-rc.2`
- [ ] Live-HMR config reload re-run

## Source URL index

- Release notes 0.1.7-rc.2: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2
- Release notes 0.1.7-rc.1 (carries the 0.1.5-rc.3 delta): https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1
- Agent boot and the compatibility gate: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2/packages/boot/app-boot
- Compaction Basic: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2/packages/compaction/compaction-basic
- Spill policy: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2/packages/spill/spill-policy
- LLM content blocks: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2/packages/llm/llm
- Shipped agent presets: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2/packages/app/web-app/presets
