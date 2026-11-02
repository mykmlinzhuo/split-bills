# 出去玩记账 · GitHub + Cloudflare 版

全程在网页上操作，不需要装任何东西。仓库里没有密钥，设成公开仓库也没关系。

## 部署（只做一次）

1. **GitHub**：新建仓库（比如叫 splitbill）→ 点 "uploading an existing file" → 把这个文件夹里的文件全部拖进去 → Commit
2. **Cloudflare**（免费注册）：进入 Workers 和 Pages → 创建 → 导入 Git 存储库（Import a repository）→ 授权 GitHub，选刚才的仓库
   - 项目名称必须填 `split-bills`（和 wrangler.jsonc 里的 name 一致）
   - 其他设置保持默认，点部署。第一次部署会自动创建数据库
3. **TOKEN**：不用在 Cloudflare 里设。`worker.js` 顶部的 `TRIPS` 里存的是每次行程 TOKEN 的 sha256，明文只在群里的链接里
4. 打开 `https://split-bills.你的子域名.workers.dev/你的TOKEN/` 就能用了，把这个链接发到群里

## 每次出去玩开一本新账

每个 TOKEN 是一本独立的账，没有"清空"这回事：

1. 生成一串新的随机字母数字当新 TOKEN，算出 sha256：`printf %s '新TOKEN' | sha256sum`
2. 在 `worker.js` 的 `TRIPS` 里加一行 `{ name: "这次去哪", sha256: "算出来的哈希" }`，保存后自动部署
3. 把 `https://split-bills.你的子域名.workers.dev/新TOKEN/` 发到群里

旧行程的链接照样能打开查账。不想让旧链接再打开，就把那一行删掉（账还留在数据库的 trips 表里）。

## 手机上怎么用

- 把第 4 步的链接发到群里，每个人用手机浏览器（或微信里点开后选「在浏览器打开」）打开，第一次选一下「你是谁」就记住了
- 加到主屏幕，用起来像 App：iPhone 用 Safari 点「分享 → 添加到主屏幕」；安卓在浏览器菜单里点「添加到主屏幕 / 安装应用」
- 别人记的账几秒内会自动同步过来，不用手动刷新
- 在国内不开梯子也想打开：`workers.dev` 域名被墙了，需要一个自己的域名托管到 Cloudflare，然后在这个 Worker → 设置 → 域和路由 → 添加「自定义域」，比如 `bill.你的域名.com`，链接改成 `https://bill.你的域名.com/你的TOKEN/`

## 之后怎么改

在 GitHub 网页上直接编辑文件，保存后 Cloudflare 会自动重新部署。

- 改成员名字、头像：`worker.js` 顶部的 `MEMBERS`。`art` 是头像，按名字意象画的：`stream` 林间清溪、`moon` 满月、`south` 南方海边、`hill` 云雾小山、`skysea` 秋空大海、`joy` 满是欢喜的花（成员名单所有行程共用；改掉或删掉某个成员 id，旧行程里这个人的账会对不上）
- 改常用分类（吃饭、打车、酒店……）：`worker.js` 里的 `CATEGORIES`
- 线上是否正常：GitHub 的 Actions → Live check 会在每次合并后检查；也可以直接打开 `https://split-bills.你的子域名.workers.dev/healthz`
