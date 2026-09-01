# dsh-token-optimizer

Deterministic, recoverable tool-result compression and cache-aware compaction for DeepSeek Harness.

[中文文档](README.zh.md)

## What it does

- Compresses large successful text tool results before they repeatedly enter the model context.
- Archives every lossy replacement and exposes `retrieve_spill` for exact, session-authorized recovery.
- Provides a root-level `BasicCompactionEngine` adapter with a 62.5% default threshold while preserving DSH's cache-aware replay behavior across shipped agent modes.
- Adds a Web conversation dashboard for projected context pressure and cumulative cache-hit metrics.

## Install

Install the public bundle into a DSH profile:

```sh
dsh plugin --profile web add dsh-token-optimizer
```

Restart the existing `dsh web` process after installation. The bundle enables recoverable tool-result compression, spill retrieval, projection, the Web dashboard, and the 62.5% automatic compaction engine across all four shipped agent modes. No user preset copy is required.

The root engine observes each agent's pressure and overflow lifecycle. In Standard, PTC, and Creator modes it runs before the isolated stock engine, so the surface is reduced at 62.5% and the stock 80% fallback has no second reduction to perform. Minimal mode has no preset compaction group and uses the root engine directly. The optional [`preset-cordis.yml`](preset-cordis.yml) fragment remains for deployments that deliberately want to replace a preset's isolated provider itself; do not edit shipped presets.

## Verify

```sh
pnpm install
pnpm run check
npm pack --dry-run
```

The current test suite covers deterministic compression, persistent recovery, session lineage authorization, compaction defaults, DSH projection behavior, and real tool-runtime integration.

## Compatibility

Built and tested against DeepSeek Harness `0.1.1-rc.2`. The DSH packages are optional peer dependencies so the profile runtime supplies its own matching services.

## License

[MIT](LICENSE)
