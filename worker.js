// 出去玩记账 · Cloudflare Workers + D1 版
// 接口和 Python 版完全一样，前端 index.html 原样复用。
// TOKEN / ADMIN_KEY 放在 Cloudflare 后台的 Secret 里，仓库里没有任何密钥，公开也没关系。
import INDEX_HTML from "./index.html";

// 成员名单：改名字 / 头像都在这里，改完重新 deploy
// id 是账本里记的，别改；art 是头像：按每个人名字的意象画的小画，可选值见 index.html 里的 ART
const MEMBERS = [
  { id: "lz",  name: "lz",  art: "stream", color: "#4F7D3F" }, // 林间清溪
  { id: "gq",  name: "gq",  art: "moon",   color: "#33407A" }, // 满月
  { id: "tjn", name: "tjn", art: "south",  color: "#F4A76A" }, // 南方海边
  { id: "zxs", name: "zxs", art: "hill",   color: "#77A36E" }, // 云雾环绕的小山
  { id: "xmy", name: "xmy", art: "skysea", color: "#2A64A3" }, // 秋空与大海
  { id: "hjy", name: "hjy", art: "joy",    color: "#E84A5F" }, // 满是欢喜的花
];
const IDS = MEMBERS.map((m) => m.id);

// 常用分类：选了之后还能在备注里继续写
const CATEGORIES = [
  { id: "food",   name: "吃饭", icon: "🍜" },
  { id: "taxi",   name: "打车", icon: "🚕" },
  { id: "hotel",  name: "酒店", icon: "🏨" },
  { id: "ticket", name: "门票", icon: "🎫" },
  { id: "travel", name: "交通", icon: "🚄" },
  { id: "snack",  name: "零食饮料", icon: "🧋" },
  { id: "shop",   name: "购物", icon: "🛍️" },
  { id: "other",  name: "其他", icon: "📌" },
];
const CAT_IDS = CATEGORIES.map((c) => c.id);
const MAX_AMOUNT = 100_000_000; // 单笔上限 100 万元（单位：分）

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const isInt = (v) => Number.isSafeInteger(v);
const fmt = (c) => (c / 100).toFixed(2);
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function safeEq(a, b) {
  const x = new TextEncoder().encode(String(a ?? ""));
  const y = new TextEncoder().encode(String(b ?? ""));
  if (!y.length || x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

// ------------------------------------------------------------ 校验
function parseExpense(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "请求格式不对");
  const desc = String(b.desc ?? "").trim().slice(0, 60);
  const cat = b.cat ? String(b.cat) : "";
  if (cat && !CAT_IDS.includes(cat)) throw new HttpError(400, "分类不对");

  const amount = b.amount;
  if (!isInt(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new HttpError(400, "金额要大于 0");

  if (!IDS.includes(b.payer)) throw new HttpError(400, "付款人不在名单里");

  if (!Array.isArray(b.participants) || !b.participants.length) throw new HttpError(400, "至少选一个参与的人");
  if (b.participants.some((p) => !IDS.includes(p))) throw new HttpError(400, "参与人不在名单里");
  const set = new Set(b.participants);
  const parts = IDS.filter((id) => set.has(id)); // 去重并按名单顺序

  let shares = {};
  if (b.split === "equal") {
    const base = Math.floor(amount / parts.length), rem = amount % parts.length;
    parts.forEach((m, i) => { shares[m] = base + (i < rem ? 1 : 0); });
  } else if (b.split === "exact") {
    const ex = b.exact;
    if (!ex || typeof ex !== "object") throw new HttpError(400, "按金额分时要填每个人的金额");
    let total = 0;
    for (const m of parts) {
      const v = ex[m];
      if (!isInt(v) || v < 0) throw new HttpError(400, `${m} 的金额不对`);
      shares[m] = v; total += v;
    }
    if (total !== amount) throw new HttpError(400, `每人金额加起来是 ¥${fmt(total)}，和总额 ¥${fmt(amount)} 对不上`);
  } else {
    throw new HttpError(400, "分法只能是平均分或按金额");
  }
  return { cat, desc, amount, payer: b.payer, participants: parts, split: b.split, shares };
}

// ------------------------------------------------------------ 结算
// 把非零成员划分成尽可能多的「和为 0 的小组」，每组内部 (组大小-1) 笔结清，
// 总笔数 = 非零人数 - 组数，是理论最少。≤12 人精确求解，更多人退化为贪心。
function minTransfers(net) {
  const items = Object.entries(net).filter(([, v]) => v !== 0);
  const k = items.length;
  if (!k) return [];
  const vals = items.map(([, v]) => v);

  let groups;
  if (k <= 12) {
    const N = 1 << k;
    const sums = new Array(N).fill(0);
    for (let mask = 1; mask < N; mask++) {
      const low = mask & -mask;
      sums[mask] = sums[mask ^ low] + vals[31 - Math.clz32(low)];
    }
    const memo = new Map();
    const best = (mask) => {
      if (mask === 0) return [0, []];
      if (memo.has(mask)) return memo.get(mask);
      const low = mask & -mask, rest = mask ^ low;
      let result = [-1, []];
      let sub = rest;
      while (true) {
        const g = sub | low;
        if (sums[g] === 0) {
          const [c, gs] = best(mask ^ g);
          if (c + 1 > result[0]) result = [c + 1, [...gs, g]];
        }
        if (sub === 0) break;
        sub = (sub - 1) & rest;
      }
      memo.set(mask, result);
      return result;
    };
    groups = best(N - 1)[1].map((g) => [...Array(k).keys()].filter((i) => (g >> i) & 1));
  } else {
    groups = [[...Array(k).keys()]];
  }

  const transfers = [];
  for (const g of groups) {
    const cred = g.filter((i) => vals[i] > 0).map((i) => [items[i][0], vals[i]]).sort((a, b) => b[1] - a[1]);
    const debt = g.filter((i) => vals[i] < 0).map((i) => [items[i][0], -vals[i]]).sort((a, b) => b[1] - a[1]);
    let ci = 0, di = 0;
    while (ci < cred.length && di < debt.length) {
      const amt = Math.min(cred[ci][1], debt[di][1]);
      transfers.push({ from: debt[di][0], to: cred[ci][0], amount: amt });
      cred[ci][1] -= amt; debt[di][1] -= amt;
      if (cred[ci][1] === 0) ci++;
      if (debt[di][1] === 0) di++;
    }
  }
  const order = Object.fromEntries(IDS.map((m, i) => [m, i]));
  transfers.sort((a, b) => order[a.from] - order[b.from] || order[a.to] - order[b.to]);
  return transfers;
}

function settle(expenses) {
  const paid = Object.fromEntries(IDS.map((m) => [m, 0]));
  const owed = Object.fromEntries(IDS.map((m) => [m, 0]));
  for (const e of expenses) {
    if (e.payer in paid) paid[e.payer] += e.amount;
    for (const [m, c] of Object.entries(e.shares)) if (m in owed) owed[m] += c;
  }
  const net = Object.fromEntries(IDS.map((m) => [m, paid[m] - owed[m]]));
  return {
    balances: Object.fromEntries(IDS.map((m) => [m, { paid: paid[m], owed: owed[m], net: net[m] }])),
    transfers: minTransfers(net),
  };
}

const snapshot = (data) => ({ members: MEMBERS, categories: CATEGORIES, expenses: data.expenses, settlement: settle(data.expenses) });

// ------------------------------------------------------------ 存储
// 整个账本存成 D1 里的一行 JSON：每次刷新只读 1 行，远低于免费额度。
// 写入用 version 做乐观锁，两个人同时提交也不会互相覆盖。
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, data TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS backups (created_at INTEGER NOT NULL, data TEXT NOT NULL)"),
    db.prepare(`INSERT OR IGNORE INTO ledger (id, version, data) VALUES (1, 0, '{"expenses":[]}')`),
  ]);
  schemaReady = true;
}

async function readLedger(db) {
  const row = await db.prepare("SELECT version, data FROM ledger WHERE id = 1").first();
  return { version: row.version, data: JSON.parse(row.data) };
}

async function mutate(db, fn) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 30 + Math.random() * 120 * attempt));
    const { version, data } = await readLedger(db);
    const pre = fn(data) || []; // fn 直接修改 data，可返回需要一起执行的额外语句
    const update = db
      .prepare("UPDATE ledger SET data = ?, version = version + 1 WHERE id = 1 AND version = ?")
      .bind(JSON.stringify(data), version);
    const results = await db.batch([...pre, update]);
    if (results[results.length - 1].meta.changes === 1) return data;
  }
  throw new HttpError(409, "刚好有人同时在改，再点一次");
}

// ------------------------------------------------------------ 路由
async function readBody(req) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 65536) throw new HttpError(413, "请求太大");
  try { return await req.json(); } catch { throw new HttpError(400, "请求格式不对"); }
}
function me(req) {
  const m = req.headers.get("x-member") || "";
  if (!IDS.includes(m)) throw new HttpError(403, "先选你是谁");
  return m;
}
function findExpense(data, id, who) {
  const e = data.expenses.find((x) => x.id === id);
  if (!e) throw new HttpError(404, "这笔账已经不存在了，可能被删了");
  if (e.created_by !== who) throw new HttpError(403, "只能改自己记的账");
  return e;
}

let versionCache;
async function htmlVersion() {
  if (!versionCache) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(INDEX_HTML));
    versionCache = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 12);
  }
  return versionCache;
}

export default {
  async fetch(req, env) {
    try {
      // 健康检查：不需要 TOKEN，只回答"线上是哪个版本、密钥和数据库是否正常"，不含任何账本内容。
      // version 是 index.html 的 sha256 前 12 位，GitHub Actions 拿它和仓库里的文件比，确认新版本真的上线了。
      if (new URL(req.url).pathname === "/healthz") {
        let db = false;
        try { await env.DB.prepare("SELECT 1").first(); db = true; } catch {}
        const secrets = !!env.TOKEN && !!env.ADMIN_KEY;
        return json({ ok: db && secrets, version: await htmlVersion(), secrets, db });
      }
      if (!env.TOKEN || !env.ADMIN_KEY) {
        return new Response("还没设置密钥：在 Cloudflare 后台这个 Worker 的 设置 → 变量和机密 里添加 TOKEN 和 ADMIN_KEY（类型选「密钥 / Secret」）。", {
          status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      const url = new URL(req.url);
      const segs = url.pathname.split("/").filter(Boolean);
      if (!segs.length || !safeEq(segs[0], env.TOKEN)) return new Response("Not Found", { status: 404 });
      const rest = segs.slice(1).join("/");
      const method = req.method;

      if (method === "GET" && rest === "") {
        if (!url.pathname.endsWith("/")) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
        return new Response(INDEX_HTML, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
        });
      }

      const db = env.DB;
      await ensureSchema(db);

      if (method === "GET" && rest === "api/state") {
        return json(snapshot((await readLedger(db)).data));
      }

      if (method === "POST" && rest === "api/expenses") {
        const who = me(req);
        const fields = parseExpense(await readBody(req));
        const now = Math.floor(Date.now() / 1000);
        const e = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), ...fields, created_by: who, created_at: now, updated_at: now };
        const data = await mutate(db, (d) => { d.expenses.push(e); });
        return json(snapshot(data));
      }

      const m = rest.match(/^api\/expenses\/([A-Za-z0-9]{1,32})$/);
      if (m && (method === "PUT" || method === "DELETE")) {
        const who = me(req);
        const fields = method === "PUT" ? parseExpense(await readBody(req)) : null;
        const data = await mutate(db, (d) => {
          const e = findExpense(d, m[1], who);
          if (method === "PUT") Object.assign(e, fields, { updated_at: Math.floor(Date.now() / 1000) });
          else d.expenses.splice(d.expenses.indexOf(e), 1);
        });
        return json(snapshot(data));
      }

      if (method === "POST" && rest === "api/reset") {
        if (!safeEq(req.headers.get("x-admin"), env.ADMIN_KEY)) throw new HttpError(403, "只有管理员能清空");
        const data = await mutate(db, (d) => {
          const pre = d.expenses.length
            ? [db.prepare("INSERT INTO backups (created_at, data) VALUES (?, ?)").bind(Math.floor(Date.now() / 1000), JSON.stringify(d))]
            : [];
          d.expenses = [];
          return pre;
        });
        return json(snapshot(data));
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "服务器出错了，稍后再试" }, 500);
    }
  },
};
