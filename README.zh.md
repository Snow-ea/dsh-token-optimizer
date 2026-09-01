# dsh-token-optimizer

面向 DeepSeek Harness `0.1.1-rc.2` 的 Cordis 插件包，组合三类能力：

- `tools/post-execute` 上的确定性纯文本结果压缩。
- 基于官方 `BasicCompactionEngine` 的低阈值、缓存复用 compaction adapter。
- 可持久检索的 spill archive 与会话 token/caching dashboard。

源码位于 `src/`，构建产物位于 `lib/`。包包含三个组合文件：

| 文件 | 用途 |
| --- | --- |
| `cordis.yml` | host 拥有 `ctx.compaction` 时使用的独立 root composition 示例。 |
| `cordis.patch.yml` | Web profile bundle patch：root 结果策略、62.5% 跨 preset 自动 compaction、retrieve、projection 与 Client dashboard。 |
| `preset-cordis.yml` | 可选的用户 preset 片段，用于替换某个 isolate compaction provider。 |

## 安全网

### 1. 持久 Spill Archive

**每个发生有损压缩的中等或大结果，在 replacement 发布之前，完整原文都会被保存两次：**

1. 调用 `ctx.spillStore.saveText()`，与现有 DSH spill backend 保持兼容。
2. 保存到本插件的持久 archive，默认根目录为：

```text
<DSH_HOME>/token-optimizer-spill/
```

archive 采用内容寻址和会话授权：

```text
sessions/<sha256(sessionId)>/artifacts/<sha256>.txt
sessions/<sha256(sessionId)>/lineage.json
```

- 每个 session-local artifact 文件保存完整 UTF-8 原文，同时就是该 session 的授权记录；没有共享 artifact/reference 两文件提交。
- `lineage.json` 保存受信任的父 session 关系，fork session 可以读取其祖先 session 已有的 `SPILL_ID`，但模型不能自行指定父 session。
- 所有路径只由 SHA-256 派生，绝不使用模型提供的路径。
- retrieve 时会验证 session lineage、artifact 路径和文件内容哈希。
- archive 默认位于当前 OS 用户的 DSH home；生产部署应保持该目录的用户私有 ACL，并把 `archiveRoot` 指向同等受保护的本地存储。

archive 写入失败时，插件保留原始 inline 工具结果，绝不会发布一个无法恢复的裁剪文本。`ctx.spillStore` 镜像失败不会造成信息丢失，因为 archive 已是成功 replacement 的前提；该失败会记录 warning。

### 2. 可追溯 SPILL_ID 与精确检索

每个 replacement 尾部都有稳定、唯一、可追溯的标记：

```text
[SPILL_ID: sha256:<64 hex>; mode=large; original=20000; saved=18900] Content was trimmed, not lost. Retrieve the complete original with retrieve_spill(spillId="sha256:<64 hex>").
```

`SPILL_ID` 是完整原文的 SHA-256，故相同输入始终产生相同 marker。模型可调用：

```text
retrieve_spill(spillId="sha256:<64 hex>", offset=0, limit=8192)
```

工具返回完整原文的一个精确 Unicode code-point 窗口，同时给出 `totalChars` 与 `hasMore`。继续增加 `offset` 即可无损取回整个 artifact。跨 session 使用同一 ID 会被拒绝。

archive 是磁盘持久的：新建 `SpillArchive` 实例、插件 fiber reload 或 DSH 进程重启后，仍可从同一 `<DSH_HOME>/token-optimizer-spill` 按相同 session、其受信任 fork lineage 和 ID 读取内容。不要删除该目录，除非明确放弃这些 spill artifacts。

### 3. 模型感知

replacement 明确写出：

```text
Content was trimmed, not lost.
Retrieve the complete original with retrieve_spill(...).
```

模型不会把裁剪内容误解为丢失内容。marker 也记录原文长度和替换后的实际节省字符数。

## 工具结果策略

策略仅处理成功工具调用的纯 `text` block。失败结果、图片、tool-call 等混合内容、Code Mode nested dispatch、`retrieve_spill` 本身，以及下游 hook 已经显式 replacement 的 `content`/`value` 都原样通过。

### 小结果

文本严格小于 `smallResultChars`（默认 `1200` 个 Unicode code point）时：

- 直接返回下游 `next()` 的决策。
- 不保存、不变换、不重建任何 content。
- 保持字节级输入一致性与前缀缓存命中。

### 中等结果

中等结果按固定顺序处理：

1. 去 ANSI 控制序列。
2. 统一换行、折叠连续空白行。
3. 将至少三行的连续重复行折叠为 `[line repeated xN]`。
4. 在规范化结果中显式保留头部 `mediumHeadChars`（默认 `4096`）与尾部 `mediumTailChars`（默认 `1024`）上下文。

完整原文仍写入 archive 和 `ctx.spillStore`。若包含 marker 的最终 replacement 不能严格短于原文本，则不做替换。

### 大结果

长度达到 `largeResultChars`（默认 `12000`）时，保留 `previewChars`（默认 `1000`）预算的首尾预览，加 `SPILL_ID`、清晰 retrieve 指引和准确节省量。完整原文按安全网机制保存。

所有压缩函数都是确定性的：相同输入、相同配置会得到相同的正文、SPILL_ID 和 marker。

## Cache-aware compaction

`TokenOptimizerCompactionEngine` 继承 `@deepseek-ai/dsh-compaction-basic` 的完整实现，默认 `thresholdRatio: 0.625`。它没有重写高风险的 compaction transaction；官方 backend 继续负责：

- `ctx.tokenMeter` 的完整 envelope/surface 压力测量。
- tool-call/result 成对边界、retained tail 与 overflow recovery。
- durable `compaction/start` / `summary` / `end` bracket。
- checkpoint replacement 与失败收尾。
- 通过 `ctx.llm.stream()` 回放原始 `system`、`tools`、shadowed messages，只在末尾追加 compaction instruction。

最后一点使摘要请求成为已预热会话前缀的扩展，而非重建 system prompt/tools schema，从而尽可能复用 provider KV cache。

`dsh-token-optimizer/engine` 在同一个 Cordis realm 中必须是唯一的 `ctx.compaction` provider。安装 bundle 后，root engine 会跨 agent 监听 pressure/overflow 生命周期；Standard、PTC、创造模式中的隔离 stock engine 只作为 80% 的兜底，root engine 已在 62.5% 先完成压缩，因此不会重复压缩。若在同一个 preset realm 内手工替换 provider，仍不能与 stock `dsh-compaction-basic` 或提供同一服务的 dsh-headroom backend 并列加载。

## Dashboard

Host 注册 `tokenOptimizer` session projection，统计：

- 结果压缩数、spill 数、实际节省字符和固定密度估算 token。
- compaction 次数和 shadowed token 数。
- 官方 `tokenUsage` 中的会话累计 cache read / write / uncached input 数据。
- 官方 `contextPressure.projectedTokens` 中的预计下一次请求上下文占用。

Client 在 `conversation.composer.dock` 分开显示两个不同口径：

```text
current context = contextPressure.projectedTokens
cache hit rate = cacheReadTokens /
  (uncachedInputTokens + cacheReadTokens + cacheWriteTokens)
```

`上下文`会随 surface 变化，并在 compaction 提交后立即按 shadowed token 差值重算；`缓存命中（累计）`是整个会话历史请求的供应商用量比例，不会因 compaction 回滚。投影尚未到达页面时，面板显示“等待会话投影”，不会用局部聊天窗口伪装全会话统计。重启或新建会话后的短暂等待正常；一旦已有新的会话事件仍持续显示该后缀，则说明 Host projection 未正常注册。该统计用于可观测性，不用于计费或访问控制。

## 长任务基准（2026-08-30）

以下结果来自本机可复现的 headless A/B 测试，而不是 dashboard 的字符密度估算。每个 run 都是新 session，最终响应必须严格等于 `BENCHMARK_DONE: HYDRA-17|ORBIT-42|CHECKPOINTS-OK`；所有记录均通过该质量断言。实际 provider usage 从持久 session log 解析，Prompt Token 的计算口径为：

```text
uncachedInputTokens + cacheReadTokens + cacheWriteTokens
```

### 环境与控制变量

- DSH `0.1.1-rc.2`，`dsh-token-optimizer@0.1.8`。
- Provider / model / effort：`openai / gpt-5.6-terra / xhigh`，由每个 session 的 `request/header` 验证。
- 每个 workload 强制模型按顺序读取固定 fixture 与两个 checkpoint，再输出固定 sentinel；模型不允许写文件或调用 shell。
- 为承载超长单行 fixture，headless benchmark overlay 将 `tool-fs` 的 `readMaxBytes` 与 `readMaxLineLength` 临时升至 `3,000,000`。这不是生产默认值。
- 除特别说明外，结果策略测试中的内置 `tool-result-pruner` 被禁用，以避免不可恢复 pruner 与可恢复 archive 双重接管同一结果。
- 每组当前只有一次采样。模型生成、Provider KV cache 和网关计量会波动；表中的 Token 差值是已测事实，不是费用承诺或统计显著性结论。

### 结果策略：2.7MB 单结果

workload 先读取一个 `2,700,000` 字符的 evidence 文件，再读取两个小 checkpoint。这个 fixture 在默认 `1.05M` context 下不跨 80% compaction 阈值，因此能单独观察 post-execute 结果策略是否在下一次模型请求前降低 surface。

| 组别 | 结果策略 / engine | Prompt Token | Uncached input | Cache read | Summary / prune | Spill | 质量 |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| Stock（内置 pruner 开启） | 原版 pruner + Basic 80% | 1,181,449 | 404,233 | 777,216 | 0 / 0 | 0 | 通过 |
| Result-only | 可恢复结果压缩 + Basic 80% | 51,164 | 15,836 | 35,328 | 0 / 0 | 1 | 通过 |
| Full Optimizer | 可恢复结果压缩 + engine 62.5% | 33,529 | 10,489 | 23,040 | 0 / 0 | 1 | 通过 |

- Result-only 相对默认 Stock 少 `1,130,285` Prompt Token，即 `95.7%`。
- Full 相对默认 Stock 少 `1,147,920` Prompt Token，即 `97.2%`；但两者都没有触发 summary，所以 Full 比 Result-only 更低的单次数字**不能归因于 62.5% engine**，应视为一次采样中的模型/缓存波动。
- Stock 的内置 pruner 在这个 workload 中 `prunes=0`，因为 session 没有到达它的 compaction 时机；这证明可恢复 post-execute 策略能在普通长工具结果之后立即削减后续请求，而不是等待后期 compact。

### 提前 compaction：256K 隔离对照

为降低 xhigh 模型测试成本，下面的 headless process 通过独立 `settings-256k.yaml` 将**仅 DSH token meter 看到的 model context capacity**设为 `256,000`；当前 Web profile 和生产 `1.05M` 设置没有改变。fixture 由四个各 `170,000` 字符的连续结果构成，总计约 `170K` heuristic Token：高于 `256K × 62.5% = 160K`，低于 `256K × 80% = 204.8K`。两组均关闭内置 pruner 和本插件结果压缩，唯一变量是 compaction engine。

| 组别 | engine | contextWindow | Prompt Token | Uncached input | Cache read | Summary | Shadowed Token | 质量 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Stock | Basic 80% | 256,000 | 485,707 | 108,875 | 376,832 | 0 | 0 | 通过 |
| Engine-only | Token Optimizer 62.5% | 256,000 | 272,391 | 111,623 | 160,768 | 1 | 129,706 | 通过 |

Engine-only 少 `213,316` Prompt Token，即 `43.9%`。其 uncached input 略增 `2,748`，这是摘要调用的成本；但后续大前缀 cache read 减少 `216,064`，总 Prompt Token 仍明显下降。这个结果证明 engine 会在原 80% engine 尚未触发时提前 summary，并在后续多步任务中回收摘要成本。

### 已验证的边界

在同一 `1.05M` capacity 下，把全部约 `675K` heuristic Token 放入**一条最新**工具结果中，62.5% engine 虽然触发了两次 summary，却只 shadow 了 `2,475` Token，Prompt Token 为 `1,180,924`，与未 compact 的 `1,180,189` 基本相同。原因是官方 `retainRatio: 0.16` 必须保留最近 tail，不能把最新超大结果中间截断。这不是有效节省案例；对这类结果，post-execute preview/Spill 策略才是正确路径。

### 重跑方法

基准辅助脚本在 `benchmarks/`，不参与发布包运行时：

```powershell
# 在仓库根目录执行
node benchmarks/create-long-task-fixture.mjs
node benchmarks/create-segmented-256k-fixture.mjs

# 使用对应 --patch 启动新的 headless session；完成后从 <DSH_HOME>/sessions 找到它的 session.jsonl.zstd。
node benchmarks/summarize-session.mjs <session.jsonl.zstd> "BENCHMARK_DONE: HYDRA-17|ORBIT-42|CHECKPOINTS-OK"
```

重跑时应交错各组顺序并至少取三次中位数；若 Provider 给出不同 cache read / write 定价，应以其账单单价分别加权，而不是把 Prompt Token 直接等同于货币成本。

## 构建

`pnpm-workspace.yaml` 将本工作区开发图锁定到 `0.1.1-rc.2`，使类型检查针对当前 DSH 运行时协议。

```powershell
# 在仓库根目录执行
pnpm install
pnpm run check
```

`pnpm run check` 已包含 build；不需要接着再运行一次 build。

build 顺序不可颠倒：

1. `tsc` 输出 Host ESM、声明文件和普通 Client ESM。
2. `scripts/build-client.mjs` 把 Client 入口生成 DSH web2 所需的 lazy-CJS `window.__ModuleLoader__.load(...)` bundle。

验证：

```powershell
Get-Content .\lib\client.js -TotalCount 2
```

首行必须是 `window.__ModuleLoader__.load({`。

## 公开安装

插件发布到 npm 后，普通用户可直接把 root bundle 安装到 Web profile：

```powershell
dsh plugin --profile web add dsh-token-optimizer
```

`dsh plugin` 会在目标 profile 目录中转发给 pnpm，并识别包内的 `dsh.bundle.patch`，将 bundle 加入该 profile 的有序层列表。安装后需重启已有的 `dsh web` 进程。

这一步启用可恢复工具结果压缩、`retrieve_spill`、projection、Web dashboard，以及跨四个 shipped agent mode 生效的 62.5% 自动 compaction engine。无需复制或新建 preset，也不要修改 DSH 随附的 preset。

从公开 Git 仓库也可安装，例如：

```powershell
dsh plugin --profile web add github:Snow-ea/dsh-token-optimizer
```

仓库会提交 `lib/` 构建产物，因此该 Git 来源不依赖安装期 TypeScript 构建。面向普通用户仍优先推荐 npm 包，因为它有明确的 SemVer 版本和稳定 tarball 内容。若未来增加 `prepare` 脚本，pnpm 可能要求在 profile 的 `pnpm-workspace.yaml` 中明确允许该构建。

## Creator mode 加载

### 1. 构建并打包

Windows 仓库路径包含空格时，本地目录安装可能被 CLI 转发拆分。使用 tarball：

```powershell
# 在仓库根目录执行
pnpm run check
npm pack --pack-destination $env:TEMP
```

每次发布应递增 `package.json` 版本或更换 tarball 文件名，避免 pnpm 对同一路径、同版本的缓存歧义。

### 2. 安装 root bundle

```powershell
dsh plugin --profile web add --force "$env:TEMP\dsh-token-optimizer-<version>.tgz"
dsh --profile web --dump-config
```

Web root bundle 现在同时启用 root-level 62.5% engine：

```yaml
compaction: true
thresholdRatio: 0.625
retainRatio: 0.16
auto: true
archiveRoot: !!js dshHomePath('token-optimizer-spill')
```

root engine 的 pressure/overflow listener 会接收四个内置模式的 agent 事件。Standard、PTC、创造模式仍保留各自 isolated stock engine，但 root engine 先在 62.5% 完成压缩，stock engine 只会在 root engine 没有完成时作为 80% 兜底；极简模式没有 compaction group，直接使用 root engine。因此下载后不需要创建任何新 preset。

如需在一个用户自定义 preset 内彻底替换 isolated `ctx.compaction` provider，仍可使用 [`preset-cordis.yml`](preset-cordis.yml)；这不是内置模式的必需步骤。为保持所有替换内容可恢复，使用该片段时仍要禁用 `tool-result-pruner`：新版 DSH 的内置 pruner 会永久替换 session surface，但不会写入本插件的外部 archive。不要编辑 DSH 随附的 preset。

### 3. 重启现有 Web 进程

已占用 `127.0.0.1:3080` 的 Web 进程不会读取新 tarball。不要启动第二个服务；在原始 `dsh web` 终端按 `Ctrl+C`，确认端口释放后，在同一终端执行：

```powershell
dsh web
```

刷新 `http://127.0.0.1:3080`，新建一个选择任意内置模式的 session，即可直接体验全量 token 优化能力。原有 `Token Optimizer` 用户 preset 仍可继续使用；Client HMR 只有 DSH checkout 中的 `pnpm run dev:web` 同时重建 browser bundle 时可用，普通本地包变更仍需要 build、pack、安装和重启。

## 测试

```powershell
pnpm run check
```

当前 18 项测试覆盖：

- 小结果 Unicode 边界、ANSI/空白/重复行确定性压缩。
- medium `4096/1024` 头尾保留。
- SPILL_ID marker 和准确节省量 fixed point。
- 新 archive 实例（模拟重启）后的完整恢复、fork lineage 恢复与无关系 session 拒绝。
- 并发同一 SPILL_ID 的原子提交，以及损坏 artifact 的哈希拒绝。
- engine 的默认 62.5% 阈值与 provider 冲突时的原子失败。
- DSH `0.1.1-rc.2` 的 state/wire projection fold。
- 真实 `ToolRuntime.execute()` 的正常 accepted result、`retrieve_spill`、持久 archive 读取、downstream value replacement，以及失败结果绝不 spill。

建议手工验证：

1. 小于 `1200` 字符的工具结果和未安装时逐字节一致。
2. 中等结果保留头尾，显示 `[line repeated xN]` 与 `SPILL_ID`。
3. 大结果显示首尾 preview、明确的“trimmed, not lost”提示和 `retrieve_spill` 指引。
4. 对同一 ID 重复调用 `retrieve_spill` 直到 `hasMore: false`，确认原文完全恢复。
5. 用任一内置模式新建 session；pressure 超过 `62.5%` 时检查 compaction 计数，并执行 `/compact`。
6. 观察后续请求是否继续复用原 system/tools schema 前缀和 dashboard cache hit rate。

## 与其他插件共存

### dsh-compaction-tool-result-pruner

root engine 不依赖该 pruner，四个内置模式无需修改 preset 即可使用本插件。若你仍使用 [`preset-cordis.yml`](preset-cordis.yml) 在某个用户 preset 内彻底替换 isolated engine，则不要启用它：它确实是 `toolResultPruner` companion service，而非 `ctx.compaction` provider，但新版 DSH 会把 pruned surface replacement 持久化，而它没有调用本插件的外部 archive。为保持完整可取回保证，用户 preset 中应将该行设置为 `disabled: true`。

### dsh-spill-policy

可以共存。此包先保证 archive 完整保存，再用 `ctx.spillStore` 镜像。已有 `dsh-spill-policy` 会在自身 inline cap 仍被超过时继续接管。不要把随机 `SpillRef.locator` 拼回本插件的 model-facing 文本，否则会破坏确定性。

### dsh-trim

不要在同一工具结果上无差别叠加。两次有损 `tools/post-execute` 处理会降低可读性、重复写入存储，并让节省归因不可读。推荐只启用一个通用策略，或按工具名/阈值做互斥分工。

### dsh-headroom

若 dsh-headroom 提供 `ctx.compaction`，不能与 `dsh-token-optimizer/engine` 在同一 preset realm 并列加载。二选一。若它只提供 metrics/prompt section，则可共存，但需确认不重复接管 `agent/pre-step` 或 `agent/request-error`。

## 许可证

本项目采用 [MIT License](LICENSE)。

## 参考

- [dsh-trim](https://www.npmjs.com/package/dsh-trim)
- [dsh-headroom](https://github.com/WanYanTianDe/dsh-headroom)
- [Compaction capability seam](https://github.com/deepseek-ai/deepseek-harness/blob/main/.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)
- [Plugin development tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/index.zh.md)
