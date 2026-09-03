# dsh-token-optimizer

Deterministic, recoverable tool-result compression and cache-aware compaction for DeepSeek Harness `0.1.2-rc.1`.

[中文文档](README.zh.md)

## What it does

- Compresses large successful text tool results before they repeatedly enter the model context.
- Compresses PTC sub-dispatch log copies without changing the complete structured values received by `run_code` programs.
- Archives every lossy replacement and exposes `retrieve_spill` for exact, session-authorized recovery.
- Provides a root-level `BasicCompactionEngine` adapter with a 62.5% default threshold while preserving DSH's cache-aware replay, branded Session API, and routed image accounting.
- Adds a Web conversation dashboard through the split Conversation, Renderer, and Session client contracts.

## Install

Install the `0.2.0` bundle into a DSH `0.1.2-rc.1` Web profile:

```sh
dsh plugin --profile web add dsh-token-optimizer@0.2.0
```

Restart the existing `dsh web` process after installation. The bundle enables recoverable tool-result compression, spill retrieval, projection, the Web dashboard, and the 62.5% automatic compaction engine across all four shipped agent modes. No user preset copy is required.

The root engine observes each agent's pressure and overflow lifecycle. In Standard, PTC, and Creator modes it runs before the isolated stock engine, so the surface is reduced at 62.5% and the stock 80% fallback has no second reduction to perform. Minimal mode has no preset compaction group and uses the root engine directly. The optional [`preset-cordis.yml`](preset-cordis.yml) fragment remains for deployments that deliberately want to replace a preset's isolated provider itself; do not edit shipped presets. Existing user-copied presets are not modified automatically and should be revalidated against the DSH `0.1.2-rc.1` composition before reuse.

## Verify

```sh
pnpm install
pnpm run check
npm pack --dry-run
```

The current test suite covers deterministic compression, persistent recovery, session lineage authorization, compaction defaults, DSH projection behavior, and real tool-runtime integration.

## Compatibility

| dsh-token-optimizer | DeepSeek Harness | Status |
| --- | --- | --- |
| `0.1.9` | `0.1.1-rc.2` | Previous stable plugin release |
| `0.2.0` | `0.1.2-rc.1` | Current release |

`0.2.0` removes the retired `dsh-client-runtime` dependency, uses the split Conversation/Renderer/Session client graph, folds projections through the on-demand Session log API, and handles PTC durable dispatch logs. See [the compatibility research](docs/dsh-0.1.2-rc.1-compatibility.md). The DSH packages remain optional peer dependencies so the profile runtime supplies the matching services.

## License

[MIT](LICENSE)
