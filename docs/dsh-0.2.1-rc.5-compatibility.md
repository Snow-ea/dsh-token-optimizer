# DSH 0.2.1-rc.5 compatibility audit

## Scope and evidence

This note audits `dsh-token-optimizer` `0.2.4` (built and verified against `@deepseek-ai/dsh@0.2.1-rc.2`) against
`@deepseek-ai/dsh@0.2.1-rc.5`, and records the adaptation shipped as `0.2.5`. It uses first-party artifacts only:

- The published `0.2.1-rc.5` npm artifacts for every package this plugin compiles against (16 packages), installed
  into the plugin's own `node_modules` (`pnpm-lock.yaml` and `pnpm-workspace.yaml` overrides re-pinned from
  `0.2.1-rc.2` to `0.2.1-rc.5`).
- A byte-level declaration diff between the `0.2.1-rc.2` closure (previous audited install) and the `0.2.1-rc.5`
  closure: `diff021rc5\hash-summary.txt` and `diff021rc5\api-diff.txt`.
- A gate matrix driven by the launcher's own exported `evaluatePluginCompatibility` from
  `@deepseek-ai/dsh-app-boot@0.2.1-rc.5`, plus the real CLI (`dsh.cmd`, the desktop app runtime at
  `0.2.1-rc.5`) composing the live `web` profile.
- An isolated headless end-to-end run on a fresh `@deepseek-ai/dsh@0.2.1-rc.5` install, covering
  compress -> archive -> retrieve plus the projection fold.
- The repository build and test gate: `pnpm run build` (tsc + esbuild client) and `pnpm run test`
  (tsc test project + `node --test`), 24 tests.

Evidence lives in `D:\deepseek harness\.compat-audit\`:

- `diff021rc5\` - declaration hash summary, raw API diff, per-line classification report.
- `probe-021rc5\` - pinned `0.2.1-rc.5` probe runtime, `REPORT.md`, `matrix-output.txt`, `web-dump-config-rc5.txt`,
  `headless-dump-config-rc5.txt`.
- `e2e021rc5\` - isolated home/profile, real session logs, decoded JSONL, spill artifact, `REPORT.md`.
- `rc5-check.log` - full `pnpm run check` transcript on the `0.2.1-rc.5` closure.

## Executive conclusion

**No plugin-facing declaration changed between `0.2.1-rc.2` and `0.2.1-rc.5`, and no source line changed.**
Fifteen of the sixteen audited packages are byte-identical at the `.d.ts` level; the only changed package,
`dsh-client-ui-conversation`, changed by pure addition (View tabs/pins, header "More" menu, draft handling,
`MessageSubmissionState.newSession`/`agentPreset`). The `0.2.4` sources compile unchanged, all 24 tests pass,
the launcher gate accepts the existing `>=0.1.5-rc.1 <0.3.0` peer window on `0.2.1-rc.5`, and a real headless
session on the `0.2.1-rc.5` runtime compresses a 34,532-character tool result, archives it with a matching
SHA-256 spill id, retrieves it back in a later turn, and folds the `tokenOptimizer` dashboard projection.

`0.2.5` therefore re-pins the verified development closure to `0.2.1-rc.5` and adds this audit; it has no
code changes and no peer-range changes.

## 1. The peer gate in `0.2.1-rc.5`: byte-identical to `0.2.1-rc.2`

`dsh-app-boot@0.2.1-rc.5` carries the same compatibility implementation as `0.2.1-rc.2`: every file except
`package.json` has the same SHA-256 (the launcher `dsh` package is likewise unchanged apart from version pins),
so `engines.dsh` precedence, `workspace:^`/`workspace:~`/`workspace:*` peer handling, the
`<profile>/compatibility.json` exact-version exemption, retired-bundle cleanup, and the
"throw in the loader, print `skipping profile bundle` and continue in the CLI" behavior are all unchanged.

Measured with the launcher's own `evaluatePluginCompatibility` (not a re-implementation), against the shipped
`0.2.5` manifest (14 `@deepseek-ai/dsh*` peers, all `>=0.1.5-rc.1 <0.3.0`, deliberately no `engines.dsh`):

| runtime | `0.2.5` shipped range | `0.2.2` legacy `^0.1.5-rc.1` | narrow `^0.2.0-rc.1` |
| --- | --- | --- | --- |
| `0.1.5-rc.1` | LOAD | LOAD | SKIP |
| `0.1.5-rc.3` | LOAD | LOAD | SKIP |
| `0.1.7-rc.2` | LOAD | LOAD | SKIP |
| `0.2.0-rc.2` | LOAD | SKIP | LOAD |
| `0.2.1` | LOAD | SKIP | LOAD |
| `0.2.1-rc.2` | LOAD | SKIP | LOAD |
| `0.2.1-rc.5` | LOAD | SKIP | LOAD |
| `0.3.0` | SKIP | SKIP | SKIP |

Two extra probes in the same matrix confirm the mechanism itself still behaves as documented:
a `workspace:*` peer value resolves to the current runtime (LOAD everywhere), and an `engines.dsh` requirement
overrides peer ranges (LOAD through `0.2.1-rc.5`, SKIP on `0.3.0`). The plugin keeps using the plain peer form
on purpose, so there is a single authoritative requirement surface.

Real gate, not just the matrix: the desktop app CLI at `0.2.1-rc.5` composed the live `web` profile with
`--dump-config` (exit 0, 1,322-line tree, stderr empty). There is no `skipping profile bundle` and no
`incompatible` diagnostic, and the `dsh-token-optimizer` row is composed with its full config
(`compaction: true`, `thresholdRatio: 0.625`, `retainRatio: 0.16`, `retrieve_spill` tool, dashboard
projection, `archiveRoot: !!js dshHomePath('token-optimizer-spill')`).

The same command on the old `headless` profile correctly refuses its stale `dsh-token-optimizer@0.2.0`
(peer `^0.1.2-rc.1`) - expected fail-closed behavior, and the reason that profile needs a dependency bump
before it can exercise the optimizer again.

## 2. Declaration diff: fifteen of sixteen packages byte-identical

`lib/**/*.d.ts` SHA-256 comparison between the two closures:

| package | rc.2 -> rc.5 |
| --- | --- |
| `dsh-agent`, `dsh-client-ui-renderer`, `dsh-client-ui-session`, `dsh-client-ui-slots`, `dsh-compaction`, `dsh-compaction-basic`, `dsh-home-paths`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-projection`, `dsh-spill`, `dsh-system-prompt`, `dsh-token-meter`, `dsh-tools` | IDENTICAL (byte-for-byte) |
| `dsh-client-ui-conversation` | CHANGED (removed 5 / added 95 lines; 79 -> 80 `.d.ts` files) |

`cordis` is `4.0.5` on both sides and `schemastery` is `3.18.5` on both sides; their emitted declarations are
identical too (`dsh@0.2.1-rc.5` still depends on `~4.0.5` / `~3.18.5`).

The only changed package was classified line by line against the plugin's import surface:

- **Removed lines are supersets or doc text, not removals.** Two `@param` doc rewrites; the
  `ConversationSessionHeaderSlotProps` type and the `ConversationSessionHeader` signature were replaced by
  supersets (the rc.5 types carry the `conversation.session.header.views.actions` slot in addition to every
  rc.2 member); the large `export type { ... } from './contract/slots.ts'` line in `client/index.d.ts`
  kept all 44 rc.2 export names and added `ConversationViewActionEntry` / `ConversationViewActionsOwnerProps`
  (46 total).
- **Added lines are additive**: a new `view-pins.d.ts` (`FIXED_VIEW_ID`, `ViewPins`, `createViewPins`),
  37 lines for the View-tab "More" menu slot and its owner props/injected entries, the re-export superset,
  `MessageSubmissionState.newSession` / `agentPreset`, `DraftInitializationOptions.whenDraftExists`,
  `appendDraft`, locale keys for `session.moreViews`, and structural/comment lines.
- **Plugin surface check**: every symbol/service/event/slot the plugin imports - `tools/post-execute`,
  `tools/ptc-dispatch-log`, `defineTool`, `ToolRuntime`, `agent/created`, `compaction/summary`,
  `ProjectionDefinition` and the projection map types, `BasicCompactionEngine`/`BasicCompactionConfig`/
  `CompactionPolicyConfig`/`ModelCompactPolicyConfig`, `ContentBlock`, `SaveTextSpill`/`SpillRef`/`SpillSource`/
  `saveText`, `dshHomePath`, `PropsRuntime`/`SessionStandardProps`, `TokenUsageProjection`/
  `ContextPressureProjection`, `ConversationNode`, `scopeTarget`, `SystemPrompt` - is present and compatible in
  the rc.5 declarations. The plugin-registered slot `conversation.composer.dock` is word-for-word identical
  (only shifted by six lines). The server-side `dsh-client-ui-conversation` entry (`lib/types/index.d.ts`)
  is byte-identical.

`tsconfig` uses `skipLibCheck`, so the compile check is supporting evidence only; the byte-level diff above is
the primary evidence, and it is stronger than a compile gate for "did the public surface move".

## 3. Upstream changes that affect docs, not the code

- `0.2.1-rc.3`, `0.2.1-rc.4`, `0.2.1-rc.5` were published on 2026-10-23, 2026-10-26 and 2026-10-29. The plugin's
  development graph moves with them: `pnpm-workspace.yaml` overrides and `package.json` devDependencies now pin
  `0.2.1-rc.5`; `cordis` stays `4.0.5` and `schemastery` stays `3.18.5`.
- The updated desktop client moved its bundled runtimes under
  `resources\runtime\primary-runtime\dependencies\{node,pnpm,python}` (`runtime.json` reports
  `desktopVersion: 0.2.1-rc.5`, `node 24.21.0`, `pnpm 11.28.5`). Isolated-profile verification must use those
  bundled paths; the old `resources\runtime\pnpm\bin\pnpm.mjs` path no longer exists.
- Verification-environment gotcha (not plugin behavior): on first startup DSH imports a legacy
  `$DSH_HOME/settings.yaml` into the profile's patch layer and deletes the source file, which **rewrites**
  `profiles/<name>/cordis.patch.yml` with the settings values. In an isolated audit home, write custom
  profile patches after the first boot (or omit `settings.yaml` and pass the model/permission intent through
  the profile patch). The e2e in this audit hit exactly this: the first login imported
  `agent-default-model`/`permission` from the settings file, so the profile patch had to be restored before
  the evidence runs.
- `dsh --help` in `0.2.1-rc.5` (app layer) documents `--session-id <id>` for resuming a persisted Session;
  that is the supported way to retrieve a spill created in an earlier turn, because spill archives are
  session-lineage scoped (a fresh session is correctly refused with
  `SPILL_ID is unavailable for this session lineage`).

## 4. Verification

Build and tests on the real `0.2.1-rc.5` closure (`rc5-check.log`):

- `pnpm run build`: `tsc -p tsconfig.json` clean, client bundle rebuilt by `scripts/build-client.mjs`.
- `pnpm run test`: `tsc -p tsconfig.test.json` clean, `node --test .test-dist/test/*.test.js` -> **24/24 pass**
  (0 fail, 0 skipped, ~0.4 s). `pnpm run check` (build + test) exits 0.

Compose gate: `web --dump-config` under the app runtime, exit 0, no skips (see section 1).

End-to-end on a fresh `@deepseek-ai/dsh@0.2.1-rc.5` install, isolated home/profile, real `deepseek-account`
model route (`deepseek-flash`):

| step | evidence |
| --- | --- |
| `read` on a 33,300-char file | tool result replaced with `[SPILL_ID: sha256:7fac8021...ef2c8; mode=large; original=34532; saved=33207]` |
| spill artifact | `token-optimizer-spill\sessions\8db4d4cd...\artifacts\7fac8021...ef2c8.txt`; file SHA-256 equals the spill id; content is the complete original 34,532-char tool result |
| session log | V4 zstd decoded 22/22 frames, 45 JSONL lines, 1 SPILL_ID marker, `retrieve_spill` call present |
| retrieve (same lineage via `--session-id`) | `retrieve_spill(spillId, offset 0, limit 120)` returned `Retrieved chars 0-120 of 34532`; the model reported the correct first line |
| projection fold | `session_projcache`: `tokenOptimizer = { originalChars: 34532, retainedChars: 1325, savedChars: 33207, savedTokens: 8301, compressedResults: 1, spilledResults: 1, compactionCount: 0 }`; `tokenUsage` and `contextPressure` also folded |

Negative control: a retrieve attempted from a different session lineage fails with
`SPILL_ID is unavailable for this session lineage`, confirming the archive is scoped as designed and that the
successful retrieve above was not a false positive.

## 5. Release gate checklist

- [x] Declaration diff: 15/16 packages byte-identical, the changed one classified line by line.
- [x] `tsc` clean for `src` and `test` against the real `0.2.1-rc.5` closure.
- [x] All 24 repository tests pass on that closure.
- [x] Gate matrix with the launcher's own `evaluatePluginCompatibility`: LOAD through `0.2.1-rc.5`, SKIP `0.3.0`.
- [x] Real `web --dump-config` under the `0.2.1-rc.5` app runtime: zero skip warnings, full optimizer config.
- [x] Real headless session on `0.2.1-rc.5`: compress -> spill artifact (hash match) -> retrieve -> projection.
- [x] `npm publish dsh-token-optimizer@0.2.5` - published from commit `e4c4c82` at `2026-10-30T13:29:29Z`;
  registry `dist-tags.latest` is `0.2.5` and `gitHead` is `e4c4c825b7152b16610807107c272005a1ccebbb`, which
  equals `git rev-parse v0.2.5^{commit}`. The downloaded registry tarball's SHA-512
  (`sha512-lL9Os/TwK99gtJm1F/CC7Z9GWAnPb36kfnIXPIjUrHg67mt5WIPLWB7O3J3QGQnE/8+KvFP87TmGWtFk3v57vQ==`)
  matches `dist.integrity`; it has 44 files and every file except `package.json` is byte-identical to the local
  `release/dsh-token-optimizer-0.2.5.tgz` (npm strips the publish-only `prepublishOnly` script when it packs a
  directory, whereas the 0.2.4 tarball was published pre-built and kept it).
- [x] Installed `0.2.5` into the `web` profile (`dsh plugin --profile web add dsh-token-optimizer@0.2.5`, with
  the `0.2.1-rc.5` app runtime: the optimizer row still composes with zero skip warnings), and bumped the
  `desktop` profile dependency to `0.2.5` (the running app keeps `0.2.4` in memory until it restarts; the two
  releases are code-identical).

## Source URL index

- https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-app-boot/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-conversation/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-compaction-basic/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-session-projection/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-spill/v/0.2.1-rc.5
- https://www.npmjs.com/package/@deepseek-ai/dsh-tools/v/0.2.1-rc.5
