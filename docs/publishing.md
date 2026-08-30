# 公开发布第三方 DSH Plugin

> 研究日期：2026-08-30。结论优先依据本机安装的 `@deepseek-ai/dsh@0.1.1-rc.2` 实现，再以 npm、pnpm、GitHub 官方文档交叉核验。本文只描述发布与安装流程；没有执行发布、推送或任何凭据操作。

## 结论摘要

1. **当前 `dsh plugin` 不是独立的插件仓库客户端，而是 pnpm 的薄转发层。** 命令要求 `--profile <name>`，其余参数原样交给 pnpm，因此支持 pnpm 能处理的 registry 包、Git 仓库、GitHub shorthand、tarball URL/文件和目录路径等来源。
2. **能被 DSH 自动加入 profile 层栈的包，必须在 `package.json` 声明 `dsh.bundle.patch`。** 该路径指向包内的 Cordis patch YAML（官方包使用 `./cordis.patch.yml`）。只安装普通 Cordis/Node 插件包而没有此声明，会留在 profile 的依赖里，但不会成为 profile bundle。
3. **安装是 profile 隔离的。** DSH 在 `$DSH_HOME/profiles/<name>` 初始化一个私有 pnpm 项目，把包写进该 profile 的 `dependencies`；成功安装后再按已安装包的真实名称更新 `dsh.profile.bundles`。这不是全局安装，也不会修改 DSH 自身安装目录。
4. **未发现 DSH 官方公共插件 registry / catalog / discovery API。** 本地 CLI 只有 pnpm 转发与 profile 协调逻辑；官方 GitHub 仓库使用 `dsh`、`dsh-plugin` Topics，但 Topics 和 npm 搜索只是通用发现机制，不是 DSH 官方审核注册表。搜索结果里出现的第三方市场也不能视作官方 registry。
5. **建议同时提供 npm 与 GitHub 两条安装路径。** npm 包适合稳定发布、SemVer、完整 tarball；Git 安装适合源码直装，但若仓库依赖 `prepare` 构建，pnpm 可能阻止构建脚本，用户需显式允许准确的 `allowBuilds` 键。

## 1. `dsh plugin` CLI 实际支持什么安装源

CLI 对 `plugin` 子命令的定义是：管理指定 profile，并把剩余参数原样传给 pnpm；示例包括 `add <pkg>`、`remove`、`why` 等。参见本地源码：

- `<DSH_INSTALL>\lib\bin.js:19-20`
- `<DSH_INSTALL>\lib\bin.js:96-105`
- `<DSH_INSTALL>\lib\plugin-9h8shc4d.js:96-126`

因此安装语法是 pnpm 的语法，而不是 DSH 自定义 package locator。pnpm 11 的 `add` 官方帮助列出：

- registry 名称、tag、精确版本或版本范围；
- Git host shorthand；
- Git repository URL；
- tarball 文件或 URL；
- 本地目录。

官方来源：[pnpm add](https://pnpm.io/11.x/cli/add)（访问于 2026-08-30）。本地 DSH 代码还明确说明 registry 名称及其他 pnpm 参数不改写，只把相对路径、`file:`、`link:` 路径锚定到用户调用 DSH 时的目录：`plugin-9h8shc4d.js:79-94`。

典型安装命令：

```powershell
# npm registry
 dsh plugin --profile web add @your-scope/dsh-your-plugin

# 固定版本或 tag
 dsh plugin --profile web add @your-scope/dsh-your-plugin@1.2.3

# GitHub shorthand / Git URL
 dsh plugin --profile web add github:owner/repo
 dsh plugin --profile web add git+https://github.com/owner/repo.git#v1.2.3

# tarball URL
 dsh plugin --profile web add https://github.com/owner/repo/releases/download/v1.2.3/pkg.tgz
```

Git 源有一个重要差异：DSH 的失败提示说明，Git 托管包会通过 `prepare` 在安装时构建，而 pnpm 可能阻止该脚本；用户要把 pnpm 输出的**准确包键**加到 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重试（`plugin-9h8shc4d.js:123-125`）。因此更稳妥的 Git 发布方式是提交可直接运行的构建产物，或清楚记录 build-script 授权步骤；npm 包则应在发布前构建并把运行产物打入 tarball。

## 2. DSH 插件包规范

### 2.1 DSH profile bundle 的必要声明

一个供 `dsh plugin --profile … add …` 自动启用的包，至少需要：

```json
{
  "name": "@your-scope/dsh-your-plugin",
  "version": "1.0.0",
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`dsh.bundle.patch` 是 DSH 判定 bundle 的关键字段：安装后，CLI 解析包目录并读取该字段；存在就将真实包名加入 `dsh.profile.bundles`，不存在则仅作为普通依赖并警告。参见：

- `plugin-9h8shc4d.js:25-32`：判断包是否导出 patch；
- `plugin-9h8shc4d.js:35-77`：按安装后的依赖状态协调 bundle 列表；
- `dsh-app-boot\lib\index.js:526-556`：启动时读取声明、拼出 patch 路径并加载；缺少声明会失败。

官方内置 bundle 的实际 manifest 可作为一手范例：

- `<DSH_INSTALL>\node_modules\@deepseek-ai\dsh-base\package.json:29-40`
- `<DSH_INSTALL>\node_modules\@deepseek-ai\dsh-web-app\package.json:33-45`

二者都把 `cordis.patch.yml` 纳入 `files`，并声明 `dsh.bundle.patch: "./cordis.patch.yml"`。patch 本身是 Cordis loader patch 数组；官方范例从 `dsh-base\cordis.patch.yml:1-17` 开始，以 `insert` 写入带稳定 `id`、包 `name` 和可选 `config` 的行。

### 2.2 包内容与依赖

发布包必须包含：

- 被 `dsh.bundle.patch` 引用的 patch 文件；
- patch 中加载的本包运行时代码或相关插件依赖；
- 所有运行时必须的构建产物；
- 正确分类的 `dependencies` / `peerDependencies`。官方 bundle 同时使用 dependencies、peerDependencies 和 devDependencies，见 `dsh-base\package.json:41-127`。

建议在发布前运行：

```bash
npm pack --dry-run
# 或 pnpm pack --dry-run（以项目实际包管理器为准）
```

逐项确认 tarball 中存在 manifest、patch、JS、类型、README 和 LICENSE，且不包含密钥、`.env`、测试缓存或不必要源码。

## 3. Profile 安装行为

首次管理某个 profile 时，DSH 会在 `$DSH_HOME/profiles/<name>` 创建：

- 私有 `package.json`，初始 `dependencies: {}`；
- `dsh.profile.bundles`；
- profile 自己的 `cordis.patch.yml`；
- `pnpm-workspace.yaml`，使用 hoisted node linker，并关闭 peer 自动安装。

源码：`dsh-app-boot\lib\index.js:330-369`。随后 pnpm 在该 profile 目录运行（`plugin-9h8shc4d.js:101-121`）。安装成功后 DSH：

1. 读取 pnpm 写回后的 `dependencies`；
2. 按安装包的**真实包名**检查 `dsh.bundle.patch`，所以 Git/path/tarball/alias 也可协调；
3. 新 bundle 追加到 `dsh.profile.bundles`，依赖顺序决定追加顺序；
4. 被删除或升级后不再声明 bundle 的包，会从 bundle 列表移除；
5. 普通依赖不会自动成为层。

源码：`plugin-9h8shc4d.js:35-77`。启动解析时，内置 bundle 优先从 DSH 安装解析，profile 本地依赖作为第二解析锚点（`dsh-app-boot\lib\index.js:507-523`）；因此第三方包应使用自己的唯一包名，不能依靠覆盖同名内置 bundle。

## 4. 公开发现 / registry 核查

截至研究日期，本地 `@deepseek-ai/dsh@0.1.1-rc.2` 的 CLI 实现中：

- 没有 search、catalog、marketplace、registry 注册或审核命令；
- `dsh plugin` 的唯一入口是 pnpm 参数转发（`bin.js:96-105`）；
- `lib` 范围内对 `registry/catalog/discover/marketplace/npm search/dsh-plugin` 的检索只命中“registry 名称透传”的注释（`plugin-9h8shc4d.js:84`）。

因此当前可依赖的公开发现渠道是：

- npm 包页面与 npm 通用搜索；
- GitHub 公共仓库、Topics、README 链接；
- 项目作者自行维护的列表或第三方市场。

这不等于存在 DSH 官方 registry。DeepSeek Harness 官方仓库当前是公开仓库，并使用 `dsh`、`dsh-plugin` Topics，可把这些作为 GitHub 可发现性标签，但不能据此主张官方收录：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（访问于 2026-08-30）。

## 5. npm 公开发布要求

### 硬要求或条件性硬要求

- `package.json` 的 `name` 与 `version` 共同标识一个发布版本；版本必须是合法版本，且已发布的同名同版本不能再次发布。来源：[package.json 文档](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)、[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)（访问于 2026-08-30）。
- 发布者必须登录并对包/作用域有权限；账户、组织或包若要求 2FA，则发布必须满足对应策略。来源：[npm developers](https://docs.npmjs.com/cli/v11/using-npm/developers)、[npm 2FA](https://docs.npmjs.com/about-two-factor-authentication)（访问于 2026-08-30）。
- 非 scoped 包可公开发布；scoped 包首次公开发布应使用 `npm publish --access public`，或在 manifest 中设 `publishConfig.access: "public"`。来源：[公开 scoped 包](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)、[组织 scoped 包](https://docs.npmjs.com/creating-and-publishing-an-org-scoped-package)（访问于 2026-08-30）。
- 包名必须未被占用，或发布者已拥有该包/作用域的权限。

### 强烈推荐的元数据与打包控制

- `description`、`keywords`（建议含 `dsh`、`dsh-plugin`）、`license`；
- `repository`（monorepo 时包括 `directory`）、`bugs`、`homepage`；
- README 中写清安装 profile、支持的 DSH 版本、配置、权限/副作用、卸载与升级；
- `files` 发布白名单，或审慎配置 `.npmignore`。`files`、`.npmignore` 和 `.gitignore` 的选择规则见 [package.json `files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files)（访问于 2026-08-30）。

README、LICENSE、`repository`、`bugs`、`homepage` 对 npm 通用发布不是统一的准入硬门槛，但缺少它们会严重影响合法复用、可维护性和发现。npm 会对 README/LICENSE 等特殊文件应用打包规则，仍应使用 `npm pack --dry-run` 验证实际 tarball。

自动化发布优先评估 [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)；传统 CI 用最小权限的 granular access token，参见 [CI/CD 私有包与 token 指南](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow)。这些策略会变化，实际发布当天应重新核对。本文不处理任何凭据。

## 6. GitHub 公共仓库所需元数据

GitHub 创建/公开仓库并不普遍强制 README、LICENSE、Release/tag、SECURITY.md 或 Topics。但对可安装插件应区分“平台硬门槛”和“可用发布的实际必要条件”：

- **README（强烈推荐）**：解释 npm/Git 安装命令、profile 名、配置、兼容范围、构建方式和风险。[About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- **LICENSE（合法复用的条件性必要项）**：GitHub 允许公开和 fork 不等于授予复制、修改、分发许可；无许可证默认版权法适用。[Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)、[Choose a License](https://choosealicense.com/)
- **`package.json` repository/bugs/homepage（推荐）**：让 npm 页面回链仓库、Issue 和文档。
- **tag / GitHub Release（推荐，Git 安装固定版本时尤其重要）**：Release 基于 tag，可附版本说明和 tarball/资产，但不是公开仓库硬要求。[About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- **Topics（推荐）**：可使用 `dsh`、`dsh-plugin` 和功能关键词增强 GitHub 搜索，不代表官方认证。[Classifying with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- **SECURITY.md / 私密漏洞报告（安全相关插件推荐）**：[Adding a security policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)、[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository)
- **社区健康文件（推荐）**：CONTRIBUTING、Code of Conduct、Issue/PR templates 等。[Community profiles](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)

所有 GitHub 发布还必须遵守 [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)、[Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) 以及适用版权、商标和第三方许可证（以上均访问于 2026-08-30）。

## 7. 推荐的发布前流程（不在本研究中执行）

1. 选定唯一 npm 包名与 GitHub 仓库名；明确许可证和所有权。
2. 确认 `package.json` 含 `dsh.bundle.patch`，且 patch 文件被 `files` 纳入。
3. 构建后运行测试、`npm pack --dry-run`，在干净目录解包检查内容。
4. 用本地目录或生成的 `.tgz` 在一个测试 profile 安装：
   `dsh plugin --profile <test-profile> add <path-or-tgz>`。
5. 运行 `dsh plugin --profile <test-profile> why <package-name>`，再用 `dsh --profile <test-profile> --dump-config` 验证 bundle 被加入且 patch 生效。
6. 先创建公开 GitHub 仓库并推送源码，再按选择创建 tag/Release；随后登录 npm 并执行公开发布。涉及凭据、推送、发布的步骤必须由有权限的人执行。
7. 从全新环境分别验证 npm 名称和固定 tag/Git URL 两条安装路径。

## 8. 需要用户提供的最小信息

在真正准备发布（另行授权后）前，最少需要：

1. **待发布插件源码的本地路径**，以及实际构建/测试命令；
2. **npm 包名**（unscoped 或 `@scope/name`）和目标初始版本；
3. **GitHub owner/repository**，并说明新建仓库还是使用现有仓库；
4. **开源许可证选择**，以及确认代码、依赖、名称/标识有权公开；
5. **插件要支持的 DSH 版本/Profile**（如 `web`、`headless`、自定义 profile）及兼容范围；
6. **bundle 入口设计**：要写入 `cordis.patch.yml` 的插件行、默认配置和必要依赖；
7. **发布通道选择**：仅 npm、仅 Git，或两者；若 npm scoped 包，确认 public access；
8. **由谁执行最终登录、推送和发布**。最安全的默认是用户本人完成凭据步骤，或配置 npm trusted publishing；不要把 token/OTP 写入仓库或聊天记录。
