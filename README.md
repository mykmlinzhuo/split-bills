# 出去玩记账 · GitHub + Cloudflare 版

全程在网页上操作，不需要装任何东西。仓库里没有密钥，设成公开仓库也没关系。

## 部署（只做一次）

1. **GitHub**：新建仓库（比如叫 splitbill）→ 点 "uploading an existing file" → 把这个文件夹里的文件全部拖进去 → Commit
2. **Cloudflare**（免费注册）：进入 Workers 和 Pages → 创建 → 导入 Git 存储库（Import a repository）→ 授权 GitHub，选刚才的仓库
   - 项目名称必须填 `split-bills`（和 wrangler.jsonc 里的 name 一致）
   - 其他设置保持默认，点部署。第一次部署会自动创建数据库
3. **设置密钥**：部署完成后，进入这个 Worker → 设置 → 变量和机密 → 添加两个，类型都选「密钥 / Secret」：
   - `TOKEN`：随便一串字母数字，比如 `k7Qm2xPa9Lw4`，这是链接里的密钥
   - `ADMIN_KEY`：另一串，管理员用
4. 打开 `https://split-bills.你的子域名.workers.dev/你的TOKEN/` 就能用了，把这个链接发到群里

管理员链接（自己用，打开一次后结算页底部会出现"清空账本"）：
`https://split-bills.你的子域名.workers.dev/你的TOKEN/?admin=你的ADMIN_KEY`

## 手机上怎么用

- 把第 4 步的链接发到群里，每个人用手机浏览器（或微信里点开后选「在浏览器打开」）打开，第一次选一下「你是谁」就记住了
- 加到主屏幕，用起来像 App：iPhone 用 Safari 点「分享 → 添加到主屏幕」；安卓在浏览器菜单里点「添加到主屏幕 / 安装应用」
- 别人记的账几秒内会自动同步过来，不用手动刷新
- 在国内不开梯子也想打开：`workers.dev` 域名被墙了，需要一个自己的域名托管到 Cloudflare，然后在这个 Worker → 设置 → 域和路由 → 添加「自定义域」，比如 `bill.你的域名.com`，链接改成 `https://bill.你的域名.com/你的TOKEN/`

## 之后怎么改

在 GitHub 网页上直接编辑文件，保存后 Cloudflare 会自动重新部署。

- 改成员名字、头像：`worker.js` 顶部的 `MEMBERS`。`art` 是头像，按名字意象画的：`stream` 林间清溪、`moon` 满月、`south` 南方海边、`hill` 云雾小山、`skysea` 秋空大海、`joy` 满是欢喜的花（改成员 id 会让旧账对不上，建议清空账本后再改）
- 改常用分类（吃饭、打车、酒店……）：`worker.js` 里的 `CATEGORIES`
- 换密钥：在 Cloudflare 后台改 TOKEN / ADMIN_KEY 的值，不用动代码

## 其他

- 清空账本前会自动备份到数据库的 backups 表，在 Cloudflare 后台 D1 页面能看到
- 如果打开网页提示"还没设置密钥"，说明第 3 步没做或者没保存
