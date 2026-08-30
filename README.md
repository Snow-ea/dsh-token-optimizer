# dsh-token-optimizer

Deterministic, recoverable tool-result compression and cache-aware compaction for DeepSeek Harness.

[中文文档](README.zh.md)

## What it does

- Compresses large successful text tool results before they repeatedly enter the model context.
- Archives every lossy replacement and exposes `retrieve_spill` for exact, session-authorized recovery.
- Provides an optional `BasicCompactionEngine` adapter with a 62.5% default threshold while preserving DSH's cache-aware replay behavior.
- Adds a Web conversation dashboard for projected context pressure and cumulative cache-hit metrics.

## Install

Install the public bundle into a DSH profile:

```sh
dsh plugin --profile web add dsh-token-optimizer
```

Restart the existing `dsh web` process after installation. The bundle enables recoverable tool-result compression, spill retrieval, projection, and the Web dashboard.

The optional 62.5% compaction engine belongs inside a user-copied agent preset because shipped presets isolate `ctx.compaction`. Do not edit shipped presets. See [README.zh.md](README.zh.md#creator-mode-加载) and [`preset-cordis.yml`](preset-cordis.yml) for the exact replacement rows.

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
