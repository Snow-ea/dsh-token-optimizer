# dsh-token-optimizer

Deterministic, recoverable tool-result compression and cache-aware compaction for DeepSeek Harness `0.1.7-rc.2`.

[中文文档](README.zh.md)

## What it does

- Compresses large successful text tool results before they repeatedly enter the model context.
- Compresses PTC sub-dispatch log copies without changing the complete structured values received by `run_code` programs.
- Archives every lossy replacement and exposes `retrieve_spill` for exact, session-authorized recovery.
- Provides a root-level `BasicCompactionEngine` adapter with a 62.5% default threshold while preserving DSH's cache-aware replay, branded Session API, and routed image accounting.
- Adds a Web conversation dashboard through the split Conversation, Renderer, and Session client contracts.
- Declares a localized title, description, and icon so Plugin Manager shows it as a first-class bundle.

## Install

Install the `0.2.2` bundle into a DSH `0.1.7-rc.2` Web profile:

```sh
dsh plugin --profile web add dsh-token-optimizer@0.2.2
```

Restart the existing `dsh web` process after installation. The bundle enables recoverable tool-result compression, spill retrieval, projection, the Web dashboard, and the 62.5% automatic compaction engine across all four shipped agent modes. No user preset copy is required.

The root engine observes each agent's pressure and overflow lifecycle. In Standard, PTC, and Creator modes it runs before the isolated stock engine, so the surface is reduced at 62.5% and the stock 80% fallback has no second reduction to perform. Minimal mode has no preset compaction group and uses the root engine directly. The optional [`preset-cordis.yml`](preset-cordis.yml) fragment remains for deployments that deliberately want to replace a preset's isolated provider itself; do not edit shipped presets. DSH `0.1.7-rc.2` ships the four presets as extra patch layers inside its Web bundle, so a user-copied preset from an older DSH should be revalidated against the current composition before reuse.

DSH `0.1.7-rc.2` ships its own spill subsystem (`dsh-spill-local` plus `dsh-spill-policy` at `maxInlineTokens: 12500`). The optimizer keeps its durable archive as the retrieval authority and mirrors each replacement into that backend when it is present, so the two coexist without compressing the same result twice.

Since DSH `0.1.7-rc.1` the host checks a plugin's `@deepseek-ai/dsh*` peer ranges at startup and disables a bundle that does not match. This plugin declares `^0.1.5-rc.1`, which the host's prerelease-inclusive check accepts across the whole `0.1.x` line — so one release covers both `0.1.5-rc.3` (npm `latest`) and `0.1.7-rc.2`. See [the peer-gate section](docs/dsh-0.1.7-rc.2-compatibility.md#1-the-peer-gate-and-why-021-keeps-working) for the measured matrix.

## Configuration

This plugin's early compaction is controlled by one boolean, `compaction`, which defaults to on:

```yaml
# Turn the plugin's 62.5% early compaction off
- id: dsh-token-optimizer
  config:
    compaction: false
```

With it off, no root `ctx.compaction` provider and no pressure/overflow listener is registered, while tool-result compression, `retrieve_spill`, the session projection, and the dashboard all stay active. Three things to know:

1. It disables this plugin's early compaction, not all compaction: the isolated stock engines shipped with Standard, PTC, and Creator still fall back at 80%, so you return to the DSH default you had before installing the plugin. Minimal has no compaction group and therefore no compaction at all once it is off.
2. A profile patch **replaces** a plugin's whole `config` instead of deep-merging it. Every field left unwritten falls back to the value the shipped bundle sets, so a switch-only override is safe and a regression test locks that equivalence; write the other fields out when you also want to change them.
3. With the switch off, non-Web profiles no longer need the compaction overlay described in the compatibility notes, because the root provider is never claimed. While the switch is on, that overlay is still required, and its absence fails loudly with `service "compaction" has been registered at <BasicCompactionEngine>` rather than degrading silently.

The threshold itself defaults to `0.625` and can be changed:

```yaml
- id: dsh-token-optimizer
  config:
    thresholdRatio: 0.5
    retainRatio: 0.16
```

`retainRatio` must stay below `thresholdRatio`, or the upstream engine refuses to load.

## Verify

```sh
pnpm install
pnpm run check
npm pack --dry-run
```

The current test suite covers deterministic compression, persistent recovery, session lineage authorization, compaction defaults, the compaction switch, DSH projection behavior, and real tool-runtime integration.

## Compatibility

| dsh-token-optimizer | DeepSeek Harness | Status |
| --- | --- | --- |
| `0.1.9` | `0.1.1-rc.2` | Superseded |
| `0.2.0` | `0.1.2-rc.1` | Superseded |
| `0.2.1` | `0.1.5-rc.1` | Superseded |
| `0.2.2` | `0.1.5-rc.1` … `0.1.7-rc.2` | Current release |

`0.2.0` removed the retired `dsh-client-runtime` dependency, uses the split Conversation/Renderer/Session client graph, folds projections through the on-demand Session log API, and handles PTC durable dispatch logs. See [the 0.1.2-rc.1 compatibility research](docs/dsh-0.1.2-rc.1-compatibility.md).

`0.2.1` adapts to the `SpillSource` discriminated union that `dsh-spill` gained — tool producers must now declare `kind: 'tool'` — and raises every declared DSH range to `0.1.5-rc.1`. No other plugin surface changed between the two releases. See [the 0.1.5-rc.1 compatibility audit](docs/dsh-0.1.5-rc.1-compatibility.md).

`0.2.2` adapts to `0.1.7-rc.2`: it follows the removal of the `tool-result` wrapper block, adopts the awaited `agent/created` contract, mirrors the new upstream `headroomTokens` field behind two compile-time drift assertions, and declares plugin metadata for Plugin Manager. The `compaction` switch can also now turn the plugin's early compaction off. It keeps supporting `0.1.5-rc.3`, because the host's peer check accepts `^0.1.5-rc.1` for the whole `0.1.x` line. See [the 0.1.7-rc.2 compatibility audit](docs/dsh-0.1.7-rc.2-compatibility.md).

The DSH packages remain optional peer dependencies so the profile runtime supplies the matching services.

## License

[MIT](LICENSE)
