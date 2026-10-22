# 安吉包裹派送签收 · Vercel Blob 版

Next.js 应用，使用 **Private Vercel Blob Store** 持久保存用户密码哈希、会话、包裹、扫描记录、原始 Excel 和签名 PDF。Vercel Blob 是云对象存储；Vercel 函数的本地目录不会用于正式数据保存。运行应用不再需要 Neon、PostgreSQL 或 `DATABASE_URL`。

## 在 Vercel 配置

1. 打开 Vercel 项目 → **Storage → Create Database / Create Store → Blob**，访问级别选择 **Private**，连接到本项目。界面名称可能略有差异。已有 Public Blob Store 不适合保存密码哈希、客户地址和签名，请创建 Private Store。
2. 在 **Settings → Environment Variables** 确认连接生成了 **`BLOB_READ_WRITE_TOKEN`**。Token 只在服务端使用，不要加 `NEXT_PUBLIC_` 前缀，不要发送到聊天或提交到 GitHub。
3. 添加 **`ADMIN_USERNAME`**（例如 `admin`）和 **`ADMIN_PIN`**（自行设置4位数字）。首次访问 API 时自动初始化管理员，后续部署不会覆盖已有密码。管理员初始化后可以移除 `ADMIN_PIN`；如果删除业务状态或换新 Store/前缀，初始化时需重新提供。
4. 建议设置 **`BLOB_PREFIX=anji-delivery/production/v1`**；预览环境使用不同的 Store 或前缀，例如 `anji-delivery/preview/v1`。同一前缀的数据会跨部署保留。可选 `APP_TIMEZONE=Australia/Sydney` 控制 PDF 文件名时区。
5. 部署框架 **Next.js**；安装 `npm ci`，构建 `npm run build`。保存变量后 **Deployments → 最新部署 → ⋯ → Redeploy**。
6. 登录后导入 Excel，依次选择 **发货日期 → Dealer ID → 扫描托盘号**，客户签名后提交，检查 PDF 下载。摄像头必须使用 HTTPS 并允许权限。

新 Store 默认没有旧业务数据。若原 Neon 数据库已有记录，先按照下面的迁移步骤迁移，再让应用使用该 Blob 前缀。新版本不再执行数据库建表或日期字段迁移。此代码库不会自动创建 Vercel Store、添加 Token 或发布到 Vercel。Blob 的免费额度和费用以账号控制台为准。

## 数据保存和并发

- `<BLOB_PREFIX>/state.json` 是私有的业务状态，包含用户、会话、包裹、导入索引和签收索引。
- `imports/<内容哈希>/source.xlsx` 保存原始 Excel；`receipts/<内容哈希>/<文件名>` 保存签名 PDF。全部是私有对象，浏览器通过鉴权 API 下载 PDF，无法直接访问业务 JSON。
- 每次状态读取使用 SDK `get(..., {access:'private',useCache:false})` 从源站获取最新 ETag。写入使用 `put(...,{ifMatch:etag})`；新状态使用 `allowOverwrite:false`，并发冲突会重读并重试，超过上限返回409。整个扫描/签收事务在一个状态对象中提交，不会静默覆盖其他司机的记录。写入响应丢失时使用提交标识防止重复执行。
- PDF 先上传成功，才提交签收索引与托盘状态。若上传失败，托盘不变；上传成功但状态冲突/失败，可能留下未引用的私有文件，不会生成错误的签收记录。备份或清理时须按 `state.json` 引用核对，不能按文件名盲删。
- 这是面向小型派送团队的方案，每次修改需读写完整状态，操作量和费用随数据量增长。业务 JSON 上限20MB，PDF 和 Excel 独立存储；历史数据较多时需备份归档。操作密集时可能要求用户重试，不能保证任意并发量都能立即完成。

## 功能与 Excel 格式

- 管理员增删用户、重置密码；普通用户修改自己的密码。4位数字密码使用带随机盐的 scrypt 哈希；同一用户名连续失败5次锁定15分钟；会话12小时，HttpOnly Cookie。重置密码使该用户现有会话失效。
- 接受 `.xlsx`，不支持旧 `.xls`；最大4MB。第一个工作表的 **C2 为发货日期**，包裹从第9行开始。日期支持 Excel 日期、`YYYY-MM-DD`、`DD/MM/YYYY`（日/月/年）或 `YYYY年MM月DD日`，空/无效日期拒绝整份文件。
- A–H列：托盘序号、Dealer ID、托盘个数、托盘号、订单号、区、地址、装车单号。C列是参考值，扫描进度按有效托盘行数计算。包含前导零的编号请在 Excel 中保存为文本。
- 同一发货日期 + 装车单号 + 托盘号重复导入会跳过，不覆盖扫描记录；文件内重复托盘拒绝整批。
- 按发货日期和 Dealer 分组扫描、签收。订单号仅在该组内唯一匹配时可代替托盘号。未找到托盘必须额外确认，以派送失败记录并生成签名 PDF。
- PDF 包含发货日期、托盘号、结果、订单号、装车单号、扫描时间、司机和签名；命名 `YYYYMMDD-HH:MM:SS-Dealer ID.PDF`。浏览器可能替换文件名中的冒号。扫描时间以 UTC 保存，页面使用浏览器时区。
- 提交后托盘锁定。司机可下载自己的记录，管理员可查看全部记录。删除司机账号保留扫码姓名和历史签收。迁移的无日期旧包裹归入“未标注日期（历史数据）”。

## 本地开发与验证

需要 Node.js 22+。`npm ci --cache /workspace/.npm-cache` 后，复制 `.env.example` 为忽略的 `.env.local`，安全填写真实 Blob Token 及初始管理员变量，执行：

```bash
node --env-file=.env.local scripts/setup.mjs
npm run dev
npm test
npm run build
npm start
```

没有 Blob 账号时，可在 `.env.local` 显式设置 **`BLOB_LOCAL_DIR`** 为仓库之外的本地目录（例如 `/workspace/anji-delivery-local`），并填写初始管理员变量。它是本地模拟器，使用文件锁和原子替换模拟版本写入；Vercel 中禁止启用该选项，也没有从云存储失败自动回退到本地的逻辑。

`npm run test:integration` 自动创建独立临时目录、启动生产服务、验证登录/权限/Excel日期/扫描/并发/签收PDF/用户管理，并在完成后关闭服务、清理数据。先运行 `npm run build`。本地模拟器通过不表示真实 Blob Token 和云权限已经通过验证；上线后还需要执行真实导入、扫码、签收和下载验证。

## 可选：将旧 PostgreSQL 数据迁移到 Blob

无需迁移空数据库。已有业务数据时，在可信终端中准备忽略的环境文件，配置：`LEGACY_DATABASE_URL`（旧数据库连接）、`BLOB_READ_WRITE_TOKEN`（Private Store）、**全新的 `BLOB_PREFIX`**。开发依赖 `pg` 仅用于此脚本，不参与应用运行。

```bash
node --env-file=.env.local scripts/import-postgres.mjs
```

脚本以只读事务读取旧数据，复制账号密码哈希、包裹、扫描记录及 PDF，保留ID，要求重新登录。目标前缀已有业务状态时拒绝覆盖。不会删除或修改旧数据库。完成后让 Vercel 使用迁移目标的 Store/前缀，核验数据再自行停用旧库。迁移和正常初始化不能同时进行；迁移失败可能留下未引用PDF，可换新前缀重试并核查旧前缀。不需要将旧数据库连接留在 Vercel 环境中。

中文字体使用 Noto Sans CJK SC，许可见 `public/FONT-LICENSE.txt`。

## 手机端使用

页面按手机触控优化：底部功能导航、至少44px的主要触控区域、16px输入字体避免 iPhone 输入时自动放大；托盘列表在窄屏显示为卡片，长编号和地址自动换行。先选择发货日期和 Dealer，再点“打开相机扫码”；优先请求后置摄像头，识别后点击“确认扫描”，也可直接输入编号。相机需要手机浏览器 HTTPS 权限。

客户签名使用底部弹窗，手指绘制时仅签名区域阻止页面滚动；横竖屏切换保留笔迹，PDF 按原签名比例缩放。手机浏览器的真实相机对焦、权限和条码识别仍需部署后用实机验收。
