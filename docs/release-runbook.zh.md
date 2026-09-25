# 发布运行手册：login + publish 的人机分工

> 本文记录 `dsh-token-optimizer` 实际在用的发布流程。它不是[发布要求研究](publishing.md)（那份是 2026-08-30 的静态调研），而是每次发版照着做一遍的**操作手册**，写明了哪几步必须由人做、哪几步由 agent 自动做，以及**怎么证明发布真的成功了**。
>
> 最近一次更新：2026-09-25（0.2.2 发布时补写）。

## 0. 为什么要分人机两步

npm 账号 `snow_eagle` 开启了 **auth-and-writes** 两步验证。这带来两个硬约束：

1. **写入操作每次都要一次性验证码。** `npm publish` 必然先撞 `EOTP`，这是账号策略，不是配置错误。
2. **npm 的浏览器授权降级流程需要 TTY。** npm 11 的 `lib/utils/auth.js` 里 `otplease()` 开头就是：

   ```js
   if (!process.stdin.isTTY || !process.stdout.isTTY) throw err
   ```

   agent 的执行环境没有 TTY，所以 npm 直接抛 `EOTP` 退出，既不会提示打开浏览器、也不会轮询授权结果；`authUrl` / `doneUrl` 还会在 stderr 和 `~/_logs/*-debug-0.log` 里被打码成 `***`。**因此最后那一下发布动作，要么由人在有 TTY 的终端里做，要么换一种不需要逐次 OTP 的凭证。**

结论：**推送、门禁、复核可以自动化；凭据交互必须留给人。** 这不是流程没设计好，而是 2FA 的语义本身要求一个人类在场。

## 1. 一次性准备

二选一，做完一次以后每次发布都不用再碰验证码。

### 方案 A（推荐，长期）：免 OTP 的 granular token

在 npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**：

- Packages and scopes：选中 `dsh-token-optimizer`，权限 Read and write；
- 勾选 **Bypass two-factor authentication**（只有账号已开 2FA 时才会出现）。

写进 `~/.npmrc`：

```
//registry.npmjs.org/:_authToken=<token>
```

带 bypass 的 token 发布不需要逐次 OTP，agent 可以独立跑完整条发布链路。npm 官方对开了 2FA 的自动化场景推荐的就是这个做法。

### 方案 B：保持 auth-and-writes，人来做发布那一步

不改账号策略，每次发版时由人在自己的终端执行一次 `npm.cmd publish`（见 §3 的人工步骤）。agent 仍然负责发布前的全部自动步骤与发布后的复核。

## 2. 自动步骤（agent 执行）

按顺序，每步都有可验证的产物；任一步失败就停，不要往下走。

1. **改版本号并写变更说明。** `package.json` 的 `version`，以及 README / 兼容性文档里的版本引用要一起改——`README.md`、`README.zh.md` 的兼容性表和安装示例是主要漂移点。
2. **重建产物。** `lib/` 被 git 跟踪，**必须**带上重建结果，否则发布的是旧代码：

   ```powershell
   node node_modules\typescript\bin\tsc -p tsconfig.json
   node scripts/build-client.mjs          # 走 esbuild
   node node_modules\typescript\bin\tsc -p tsconfig.test.json
   ```

   > 在 DSH 沙箱里 `scripts/build-client.mjs` 会因 esbuild 的 JS API spawn 出 `EPERM`。绕过办法是直接调用原生二进制（`node_modules/.pnpm/@esbuild+win32-x64@*/node_modules/@esbuild/win32-x64/esbuild.exe`）跑 CLI，再套上 `window.__ModuleLoader__.load({ id, factory })` 外壳写回 `lib/client.js`。同理 `node --test` 也会 spawn 失败，改为逐个执行 `.test-dist/test/*.test.js`。

3. **跑测试并记录条数。** 当前基线是 24 个测试全绿。条数要写进 commit message / 发布记录，便于下次对比。
4. **打包并核对内容。**

   ```powershell
   npm pack --pack-destination release
   ```

   核对 `npm notice` 里的文件清单：`lib/`、`icon.svg`、`locale/*.json`、`cordis*.yml`、`docs/*`、`README.zh.md`、`LICENSE` 是否齐全（对照 `package.json` 的 `files`）。
5. **提交 + 打 annotated tag + 推送。**

   ```powershell
   git commit -F <message-file>
   git tag -a vX.Y.Z -m "<pkg> X.Y.Z: <一句话>"
   git push origin main
   git push origin vX.Y.Z
   ```

   > 沙箱会拦 git 的网络操作（`cannot create standard input pipe for remote-https`），push / ls-remote 需要一次提权。

6. **发布。** 方案 A 下 agent 直接执行：

   ```powershell
   npm publish
   ```

   `prepublishOnly` 会重跑 `npm run check`（build + 全部测试），门禁不过就发不出去——这是好事，别用 `--ignore-scripts` 跳过它。

7. **独立复核（§4，强制）。**

## 3. 人工步骤

### 方案 A 下

无。token 已带 bypass，agent 可全程完成。

### 方案 B 下

由人在自己的终端执行，agent 不要代跑：

```powershell
cd "D:\deepseek harness\dsh-token-optimizer"
npm.cmd publish
```

预期顺序：`prepublishOnly` 跑门禁（约 30 秒）→ registry 返回 `EOTP` → npm 因为有 TTY 而**打印浏览器授权 URL 并等待** → 人在浏览器确认 → CLI 自动重试并完成发布。

如果此时账号令牌本身已失效，会先看到 `npm whoami` 返回 **401**，那就先 `npm.cmd login`（web 登录）再来。

## 4. 发布后的独立复核（强制，不许省）

**不要从"我跑过门禁"或"终端看着成功了"推论发布成功。** 用 registry 自己的数据确认，三条命令任意一条不过就是没发成功：

```powershell
npm view dsh-token-optimizer dist-tags --json          # latest 应指向新版本
npm view dsh-token-optimizer versions --json --prefer-online
npm view dsh-token-optimizer time --json --prefer-online   # modified 时间应是刚刚
```

再直接从 registry 取回 tarball，与本机通过门禁的那份做哈希比对：

```powershell
npm pack dsh-token-optimizer@X.Y.Z --pack-destination <临时目录>
# 比对 sha512（npm view dsh-token-optimizer@X.Y.Z dist.integrity）与本地 release/*.tgz
```

必要时解包抽查：`lib/index.js`、`lib/projection-host.js` 是否含本次改动的代码，`icon.svg` / `locale/*.json` 是否存在。

> **这条规矩是有代价换来的。** 2026-09-25 发布 0.2.2 时，终端侧反馈"已经推好了"，但复核显示 registry 上根本没有 0.2.2：`dist-tags.latest` 仍是 `0.2.1`、`versions` 列表止于 `0.2.1`、packument 的 `modified` 停在 0.2.1 的发布时间、直接访问 `https://registry.npmjs.org/dsh-token-optimizer/0.2.2` 返回 `404 version not found`。当时实际完成的只有 GitHub 推送。**没有复核就会对外宣称一个并不存在的版本。**

## 5. 已知坑速查

| 现象 | 真实原因 | 处理 |
| --- | --- | --- |
| `npm publish` 报 **404 Not Found** | 不是"版本已存在"，是 npm 对发布鉴权失败的掩盖形式 | 先 `npm whoami`；401 就是令牌失效，重新 `npm login` |
| `npm publish` 报 **EOTP** | auth-and-writes 要求逐次验证码；无 TTY 时不做浏览器降级 | 走 §1 方案 A，或按 §3 方案 B 由人执行 |
| `npm whoami` 返回 **401** | `_authToken` 已失效 | `npm.cmd login` 换新令牌 |
| 认证 URL 显示成 `https://www.npmjs.com/auth/cli/***` | npm 对 `authUrl`/`doneUrl` 主动打码 | 不要试图从日志里还原，改用方案 A/B |
| `prepublishOnly` 卡在 esbuild / `node --test` 的 `spawn EPERM` | DSH 沙箱禁止带管道的子进程 | 提权执行，或按 §2 第 2 步的绕过办法手动完成等价门禁 |
| `git push` 报 `cannot create standard input pipe for remote-https` | 同上，git 的网络 helper 需要管道 | 提权执行 |
| 本地重装后仍是旧代码 | pnpm 对**同路径同版本的 `file:` tarball** 会静默复用旧内容 | 换 tarball 文件名，或删掉 lockfile + node_modules 再装 |
| 发布的包里是旧代码 | `lib/` 被 git 跟踪但忘了重建 | 发布前务必重跑 build 并 `git status` 确认 `lib/` 已更新 |

## 6. 失败后的补救

- **只是没发上去**：修好鉴权后重跑 §2 第 6 步，`prepublishOnly` 会再验一遍。npm 上不存在该版本时重发是安全的。
- **发上去了但内容不对**：72 小时内可 `npm unpublish <pkg>@<version>`，之后只能发新补丁版本。所以 §4 的复核要**在对外宣布之前**做完。
- **GitHub 已推、npm 未发**：这是本次 0.2.2 的状态。tag 已存在，补发 npm 不会造成版本错位；补发后确认 `dist-tags.latest` 与 tag 指向同一份代码即可。
