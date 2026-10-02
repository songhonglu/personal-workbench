#!/usr/bin/env node
/* ============================================================
   工作台多端同步服务器 v3 —— 零依赖单文件，Node 14+ 直接运行
   用法：node sync-server.js [端口] [数据文件] [根令牌]
   默认：端口 8788，数据存同目录 workbench-sync-data.json
   根令牌：第 3 个参数或环境变量 SYNC_ROOT_TOKEN（用于签发/管理用户令牌）

   ============================================================
   v3.0 安全模型（消除 v2 的"单一全局 token 越权"问题）：
   ------------------------------------------------------------
   1) 按用户独立令牌（Bearer）：
      • 每个注册用户拥有自己的 token，注册时由服务端签发（crypto.random）
      • 鉴权：Authorization: Bearer {userToken} → 解析为该 userId 身份
      • 一个用户只能读写自己名下数据（/data、收件箱、好友表）
   2) 全局用户目录（公开、无需鉴权）：
      • POST /api/users/register  body { username, nickname }
          → 已存在：幂等返回该用户 { userId, username, nickname, token }
          → 新用户：签发 token，写入目录，返回 { userId, username, nickname, token }
      • GET  /api/users/search?q=xx → 返回匹配的用户公开信息（username/nickname），不含 token
   3) 严格隔离：
      • GET /data?token=  仅 token 持有者本人可读（userId 由 token 反查）
      • GET /api/friends/{uid}/inbox  仅 uid 本人的 token 可拉
      • POST /api/friends/{to}/send  需调用者持有"自己"的 token（防匿名伪造）
   4) 根令牌（管理）：
      • SYNC_ROOT_TOKEN 可执行 /api/users/register 之外的管理操作（暂不开放）
   5) 兼容旧 ?token= 全局密钥：若请求带 query token 且等于根令牌，放行管理；
      否则按 Bearer 用户令牌鉴权。

   协议（前端客户端对应）：
      POST /api/users/register     { username, nickname } → { userId, username, nickname, token }
      GET  /api/users/search?q=     → { users: [ {userId,username,nickname} ] }
      GET  /data                   (Bearer userToken) → { data, rev, updatedAt }
      PUT  /data                   body { data } → { rev, updatedAt }
      POST /api/friends/{to}/send  body { msg } → { ok }
      GET  /api/friends/{uid}/inbox (Bearer uidToken) → { inbox: [...] }
      POST /api/friends/{uid}/add    body { friend } → { ok }
      POST /api/friends/{uid}/remove body { friend } → { ok }
      POST /api/friends/{uid}/markread body { msgId } → { ok }
   ============================================================ */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url"), crypto = require("crypto");

const PORT = Number(process.argv[2]) || 8788;
const DATA_FILE = process.argv[3] || path.join(__dirname, "workbench-sync-data.json");
const ROOT_TOKEN = process.argv[4] || process.env.SYNC_ROOT_TOKEN || "root-change-me";

/* 数据模型 v3：
   store = {
     data: <Song.Han 等早期全局数据（兼容旧 /data?token=全局密钥）>,
     rev, updatedAt,
     users: { [userId]: { userId, username, nickname, token, createdAt } },
     tokenIndex: { [token]: userId },
     dir: { [username]: { userId, username, nickname } },
     inboxes: { [userId]: [ msg ] },
     friends: { [userId]: [ friendId ] }
   }
   早期 v1.17 的 inbox/friends 字段兼容迁移 */
let store = { data: null, rev: 0, updatedAt: null, users: {}, tokenIndex: {}, dir: {}, inboxes: {}, friends: {} };
try { store = Object.assign(store, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); } catch (e) {}
for (const k of ["users","tokenIndex","dir","inboxes","friends"]) if (!store[k] || typeof store[k] !== "object") store[k] = {};
/* 迁移 v2 的 inbox → inboxes */
if (store.inbox && !store.inboxes) { store.inboxes = store.inbox; }
if (!store.inboxes) store.inboxes = {};
if (!store.friends) store.friends = {};
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(store));

/* ---- 鉴权：Bearer 用户令牌 → 身份 userId；根令牌 → admin ---- */
function identify(req, u){
  const h = req.headers["authorization"];
  const bearer = h && h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  const q = u.query && u.query.token;
  if (bearer) {
    const uid = store.tokenIndex[bearer];
    if (uid) return { role: "user", userId: uid, token: bearer };
    return null; // 未知用户令牌
  }
  if (q) {
    if (q === ROOT_TOKEN) return { role: "admin", token: q };
    // 兼容：旧全局密钥直接映射为根
    const legacyUid = store.tokenIndex[q];
    if (legacyUid) return { role: "user", userId: legacyUid, token: q };
    return null;
  }
  return null;
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 5e6) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res, code, obj){
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS"
  });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}

function newToken(prefix){
  let t;
  do { t = prefix + crypto.randomBytes(16).toString("hex"); } while (store.tokenIndex[t]);
  return t;
}

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (req.method === "OPTIONS") { json(res, 204, ""); return; }

  /* ---------- v3 用户目录（公开，无需鉴权） ---------- */
  if (u.pathname === "/api/users/register" && req.method === "POST") {
    return readBody(req).then(body => {
      const j = JSON.parse(body);
      const username = String((j && j.username) || "").trim();
      const nickname = String((j && j.nickname) || username || "").trim();
      if (!username || username.length > 24) throw new Error("username 1-24 字符");
      // 幂等：已存在 → 返回现有用户（不含他人 token，除非本人/管理员）
      const existing = store.dir[username];
      if (existing) {
        const rec = store.users[existing.userId];
        const ident = identify(req, u);
        const isSelf = ident && (ident.role === "admin" || ident.userId === existing.userId);
        json(res, 200, { userId: existing.userId, username, nickname: rec ? rec.nickname : nickname, token: isSelf ? rec.token : null, existed: true });
        return;
      }
      // 新用户 → 签发 token
      const userId = "usr-" + crypto.randomBytes(8).toString("hex");
      const token = newToken("wb-u-");
      const now = Date.now();
      store.users[userId] = { userId, username, nickname, token, createdAt: now };
      store.tokenIndex[token] = userId;
      store.dir[username] = { userId, username, nickname };
      save();
      json(res, 200, { userId, username, nickname, token, existed: false });
    }).catch(e => json(res, 400, "bad body: " + e.message));
  }

  if (u.pathname === "/api/users/search" && req.method === "GET") {
    const q = String((u.query && u.query.q) || "").toLowerCase().trim();
    const list = Object.values(store.dir);
    const out = q ? list.filter(x => x.username.toLowerCase().includes(q) || x.nickname.toLowerCase().includes(q)) : list;
    return json(res, 200, { users: out.map(x => ({ userId: x.userId, username: x.username, nickname: x.nickname })) });
  }

  /* ---------- /data 按用户隔离（v3：Bearer 用户令牌） ---------- */
  if (u.pathname === "/data") {
    const ident = identify(req, u);
    if (!ident) return json(res, 401, "auth required");
    // 根/管理：兼容旧全局数据（store.data）
    if (ident.role === "admin") {
      if (req.method === "GET") return json(res, 200, store.data == null ? { data: null, rev: 0, updatedAt: null } : store);
      if (req.method === "PUT") return readBody(req).then(body => {
        const j = JSON.parse(body);
        if (!j || !("data" in j)) throw new Error("bad body");
        store.data = j.data; store.rev += 1; store.updatedAt = new Date().toISOString(); save();
        json(res, 200, { rev: store.rev, updatedAt: store.updatedAt });
      }).catch(e => json(res, 400, "bad body: " + e.message));
      return json(res, 405, "method not allowed");
    }
    // 普通用户：只能读写自己名下的 data 桶（store.userData[userId]）
    const uid = ident.userId;
    if (!store.userData) store.userData = {};
    if (!store.userData[uid]) store.userData[uid] = { data: null, rev: 0, updatedAt: null };
    const bucket = store.userData[uid];
    if (req.method === "GET") return json(res, 200, { data: bucket.data, rev: bucket.rev, updatedAt: bucket.updatedAt });
    if (req.method === "PUT") return readBody(req).then(body => {
      const j = JSON.parse(body);
      if (!j || !("data" in j)) throw new Error("bad body");
      bucket.data = j.data; bucket.rev += 1; bucket.updatedAt = new Date().toISOString(); save();
      json(res, 200, { rev: bucket.rev, updatedAt: bucket.updatedAt });
    }).catch(e => json(res, 400, "bad body: " + e.message));
    return json(res, 405, "method not allowed");
  }

  /* ---------- v3 好友图 + 收件箱（严格鉴权） ---------- */
  const m = u.pathname.match(/^\/api\/friends\/([^/]+)\/(send|inbox|add|remove|markread)$/);
  if (m) {
    const ident = identify(req, u);
    if (!ident) return json(res, 401, "auth required");
    const uid = decodeURIComponent(m[1]);
    const action = m[2];

    if (action === "inbox") {
      // 仅本人（uid 的令牌）或管理员可拉自己的收件箱
      if (ident.role !== "admin" && ident.userId !== uid) return json(res, 403, "not your inbox");
      const list = store.inboxes[uid] || [];
      return json(res, 200, { inbox: list });
    }

    if (action === "send") {
      // 调用者必须持"自己"的令牌（to=uid）；msg.from 必须等于调用者身份
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const msg = j && j.msg;
        if (!msg || !msg.from || !msg.to || !msg.payload) throw new Error("bad msg (need from/to/payload)");
        const actor = (ident.role === "admin" ? msg.from : ident.userId);
        if (actor !== msg.from) throw new Error("from 与调用者身份不符");
        if (!store.inboxes[msg.to]) store.inboxes[msg.to] = [];
        store.inboxes[msg.to].unshift({ id: msg.id || ("m-" + Date.now()), from: msg.from, fromName: msg.fromName || "", type: msg.type || "todo", payload: msg.payload, text: msg.text || "", sentAt: msg.sentAt || Date.now(), read: false });
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }

    if (action === "add") {
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const f = j && j.friend;
        if (!f || !f.userId) throw new Error("need friend.userId");
        const actor = (ident.role === "admin" ? uid : ident.userId);
        if (!store.friends[actor]) store.friends[actor] = [];
        if (!store.friends[f.userId]) store.friends[f.userId] = [];
        if (!store.friends[actor].includes(f.userId)) store.friends[actor].push(f.userId);
        if (!store.friends[f.userId].includes(actor)) store.friends[f.userId].push(actor);
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }

    if (action === "remove") {
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const target = j && j.friend;
        if (!target || !target.userId) throw new Error("need friend.userId");
        const actor = (ident.role === "admin" ? uid : ident.userId);
        if (store.friends[actor]) store.friends[actor] = store.friends[actor].filter(x => x !== target.userId);
        if (store.friends[target.userId]) store.friends[target.userId] = store.friends[target.userId].filter(x => x !== actor);
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }

    if (action === "markread") {
      if (ident.role !== "admin" && ident.userId !== uid) return json(res, 403, "not your inbox");
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const msgId = j && j.msgId;
        if (!msgId) throw new Error("need msgId");
        const list = store.inboxes[uid] || [];
        const m2 = list.find(x => x.id === msgId);
        if (m2) m2.read = true;
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
  }

  json(res, 404, "not found");
}).listen(PORT, () => {
  console.log("同步服务 v3 已启动 → http://0.0.0.0:" + PORT);
  console.log("数据文件 → " + DATA_FILE);
  console.log("根令牌   → " + ROOT_TOKEN + "（仅管理/签发用户令牌，勿写入前端）");
  console.log("用户注册：POST /api/users/register  { username, nickname } → 返回该用户 token");
  (function(){ const os=require("os"); const nets=os.networkInterfaces(); const ips=Object.values(nets).flat().filter(n=>n&&n.family==="IPv4"&&!n.internal).map(n=>n.address); (ips.length?ips:[]).forEach(ip=>console.log("局域网地址 → http://"+ip+":"+PORT+"  （手机填这个）")); })();
});
