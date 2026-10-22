# 安吉包裹派送签收

Next.js 应用，部署到 Vercel；PostgreSQL 保存用户、扫码时间、派送记录与 PDF（二进制数据，无需依赖 Vercel 临时文件系统）。移动端支持摄像头，桌面支持扫码枪或手动输入。摄像头需要 HTTPS 和浏览器权限。

## 本地运行

需要 Node.js 22 或更新版本、PostgreSQL 16 或更新版本。

1. `npm ci --cache /workspace/.npm-cache`
2. 将 `.env.example` 复制为 `.env.local`，安全填写 `DATABASE_URL`、`ADMIN_PIN`（4位数字），可更改 `ADMIN_USERNAME` 和 `APP_TIMEZONE`（默认 Australia/Sydney）。数据库服务提供的 TLS 连接字符串请原样保留，不要关闭证书校验。
3. `node --env-file=.env.local scripts/setup.mjs`：初始化表和管理员，已有用户的密码不会被覆盖。
4. `npm run dev`。生产模式使用 `npm run build` 和 `npm start`。
5. `npm test` 运行核心逻辑测试。`DATABASE_URL=... node tests/integration.mjs` 在专用空白测试数据库中验证完整流程（会创建测试账号与业务数据，不用于生产数据库）。

## Vercel 部署

1. 将项目代码推送到 GitHub，将此仓库导入您的 Vercel 项目，框架选择 Next.js。构建命令 `npm run build`，安装命令 `npm ci`。
2. 创建持久 PostgreSQL 数据库（例如 Neon 或 Vercel Marketplace 提供的服务），在 Vercel 的 Production / Preview 环境安全填写 `DATABASE_URL`。建议为预览和生产分别配置数据库。
3. 在受信任的本地或云终端设置数据库连接和初始管理员用户名/PIN，执行 `npm run db:setup`。`ADMIN_PIN` 仅用于初始化，不需要留在 Vercel 运行环境。
4. 可设置 `APP_TIMEZONE=Australia/Sydney`，用于 PDF 文件名；数据库时间以 UTC 保存，页面按浏览器时区显示。
5. 部署完成后验证登录、导入、扫描、客户签名和下载 PDF。不要在聊天中发送 Vercel 密码或数据库凭据。项目尚未自动发布。

## 工作流程

- 管理员：导入 `.xlsx` 文件第一个工作表，C2 填写本文件托盘的发货日期，数据从第9行开始。日期支持 Excel 日期单元格、`YYYY-MM-DD`、`DD/MM/YYYY`（日/月/年）及 `YYYY年MM月DD日`；无效或空日期拒绝整份导入。A–H列：托盘序号、Dealer ID、托盘个数、托盘号、订单号、区、地址、装车单号。C列是参考值，实际进度以有效托盘行数为准。请将有前导零的编号在 Excel 中保存为文本。
- 单次上传最多 4MB（适配 Vercel 请求大小限制）。不支持旧版 `.xls`。同一发货日期内相同装车单号 + 托盘号跳过，不覆盖已有信息；同批文件内重复会拒绝整批。
- 司机：先选择发货日期，再选择该日期的 Dealer，扫描托盘号；订单号仅在该 Dealer 内唯一匹配时可代替托盘号。扫描记录包含服务器时间和司机。相同发货日期和 Dealer 的所有未提交托盘作为一批签收，请在当批文件导入完毕后开始派送。
- 全部扫描后自动提示客户签名；缺少托盘时也可签名，但必须额外确认，PDF 将缺少项标为派送失败。
- PDF 在服务端生成、事务保存，包含发货日期、托盘号、订单号、装车单号、结果、扫描时间、司机及客户签名。命名 `YYYYMMDD-HH:MM:SS-Dealer ID.PDF`；下载工具可能将冒号替换为适合本地文件系统的字符。
- 司机可下载自己提交的记录，管理员可查看全部记录。提交后锁定托盘，不可重复提交。后台保留原扫描人，即使账号被删除也保留时间和已生成 PDF。
- 管理员增删用户、重置密码；所有用户可以修改自己的密码。密码使用带随机盐的 scrypt 哈希，登录失败5次后锁定该用户名15分钟；会话12小时，HttpOnly Cookie。重置密码使该用户现有会话失效。

签名 PDF 可能含客户个人信息，请为生产数据库配置访问权限、备份和适合业务的保留期限。4位数字密码按需求实现，建议仅供内部派送使用。中文字体使用 Noto Sans CJK SC，许可见 `public/FONT-LICENSE.txt`。

## 此项目的 Neon 配置

已生成本地 `.neon` 项目上下文和 `neon.ts`（仅 PostgreSQL，保留应用现有账号体系）。目标为组织 `org-spring-fire-16608068`、项目 `crimson-dawn-77427505`、分支 `production`。项目级 `.codex/config.toml` 配置 Neon MCP OAuth，并限定到此项目；OAuth 授权需要在支持该配置的 Codex 客户端完成，新配置不会自动加载到已运行的聊天工具中。

本云环境全局目录不可写，使用 `npm_config_cache=/workspace/.npm-cache npx --yes neon@latest` 代替全局 `neon` 命令，并附加 `--config-dir /workspace/.neon-cli`。该目录在仓库外，不应提交。需要允许访问 `neon.com` 和 `*.neon.tech`。本地项目关联是离线写入的，需登录后验证，不能据此断言远端已配置。

在项目根目录执行：

```bash
# 在终端运行，并在浏览器中授权。无需将任何凭据发到聊天中。
npm_config_cache=/workspace/.npm-cache npx --yes neon@latest login --config-dir /workspace/.neon-cli
# 检查项目与分支，并部署 neon.ts；CLI 将连接变量写入忽略的 .env.local。
npm_config_cache=/workspace/.npm-cache npx --yes neon@latest deploy --config-dir /workspace/.neon-cli
# 仅初始化数据库表，不创建默认密码。
node --env-file=.env.local scripts/migrate.mjs
# 安全设置 ADMIN_USERNAME、ADMIN_PIN 后创建初始管理员。
node --env-file=.env.local scripts/setup.mjs
npm run build
npm start
```

应用运行使用池化 `DATABASE_URL`；初始化脚本优先使用 `DATABASE_URL_UNPOOLED`。保留 `pg` 驱动以支持现有事务，并通过 `@vercel/functions` 的 `attachDatabasePool` 管理 Vercel Fluid compute 上的连接池。

实际端到端测试应在专用测试分支执行：用 Neon CLI 创建测试分支并获取其环境变量，启动连接该分支的应用，再执行 `node --env-file=.env.local tests/integration.mjs`（默认应用地址端口3000，可通过 `TEST_BASE_URL` 更改）。测试会创建和清理本次运行的账号及派送数据，不应在生产分支直接执行。测试后切回 production 并重新拉取环境变量。不要把 `.env.local` 或数据库密码提交到 GitHub；Vercel 中仍需单独配置环境变量，`neon deploy` 不会部署 Vercel 前端。

## 发货日期功能升级

已有部署必须在发布新代码前运行 `node --env-file=.env.local scripts/migrate.mjs`（在安全终端配置 Neon 直接连接 `DATABASE_URL_UNPOOLED`）。迁移可重复执行，新增包裹/签收的日期字段，并将重复判断升级为“发货日期 + 装车单号 + 托盘号”。历史记录及已生成 PDF 保持原样；没有日期的旧包裹归入“未标注日期（历史数据）”，仍可扫描签收。旧记录不能从现有字段可靠推算日期，请勿仅为补日期重复导入历史文件，以免创建新的日期批次；历史日期整理需按原文件核实。新导入的日期会出现在工作台、签收记录和新生成的 PDF 中，PDF 文件名规则不变。
