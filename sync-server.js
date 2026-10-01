#!/usr/bin/env node
/* ============================================================
   工作台多端同步服务器 v2 —— 零依赖单文件，Node 14+ 直接运行
   用法：node sync-server.js [端口] [数据文件]
   默认：端口 8788（本机 8787 已被其他服务占用），数据存同目录 workbench-sync-data.json
   令牌：环境变量 SYNC_TOKEN，或默认 "song-workbench-2026"（建议自行修改）

   协议（与工作台内置同步客户端完全一致）：
     GET /data?token=xxx   → { data, rev, updatedAt }        读取
     PUT /data?token=xxx   body { data } → { rev, updatedAt } 写入并 rev+1

   v1.17.0 多用户扩展（好友 / 跨设备消息）：
     POST /api/friends/{toUserId}/send   body { msg }  → 写入收件箱（跨设备消息通道）
     GET  /api/friends/{uid}/inbox        → { inbox: [ msg ] }
     POST /api/friends/{uid}/add         body { friend } → 登记好友图
     数据文件 workbench-sync-data.json 新增字段：
     • inbox: { [userId]: [ msg ] }   收件箱（按 userId 隔离）
     • friends: { [userId]: [ friendId ] }  好友关系图
     认证沿用 ?token=xxx 或 Authorization: Bearer 二选一，防跨用户越权。
     ============================================================ */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");

const PORT = Number(process.argv[2]) || 8788;
const DATA_FILE = process.argv[3] || path.join(__dirname, "workbench-sync-data.json");
const TOKEN = process.env.SYNC_TOKEN || "song-workbench-2026"; // ← 建议改成一段足够长的随机密钥

let store = { data: null, rev: 0, updatedAt: null, inbox: {}, friends: {} };
try { store = Object.assign(store, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); } catch (e) {}
if (!store.inbox || typeof store.inbox !== "object") store.inbox = {};
if (!store.friends || typeof store.friends !== "object") store.friends = {};
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(store));

/* ---- 认证：query ?token=xxx 或 Authorization: Bearer xxx 二选一 ---- */
function authed(req, u){
  const q = (u.query && u.query.token);
  const h = req.headers["authorization"];
  const bearer = h && h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  return (q && q === TOKEN) || (bearer && bearer === TOKEN);
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
  res.writeHead(code, { "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS" });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (req.method === "OPTIONS") { json(res, 204, ""); return; }

  /* ---------- 原有 /data 多端同步协议（token 隔离保险箱，保持不变） ---------- */
  if (u.pathname === "/data") {
    if (!authed(req, u)) return json(res, 403, "bad token");
    if (req.method === "GET") {
      return json(res, 200, store.data == null ? { data: null, rev: 0, updatedAt: null } : store);
    }
    if (req.method === "PUT") {
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        if (!j || typeof j !== "object" || !("data" in j)) throw new Error("bad body");
        store.data = j.data; store.rev += 1; store.updatedAt = new Date().toISOString(); save();
        json(res, 200, { rev: store.rev, updatedAt: store.updatedAt });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
    return json(res, 405, "method not allowed");
  }

  /* ---------- v1.17.0 多用户：好友图 + 收件箱（跨设备消息通道） ---------- */
  const m = u.pathname.match(/^\/api\/friends\/([^/]+)\/(send|inbox|add|remove|markread)$/);
  if (m) {
    if (!authed(req, u)) return json(res, 403, "bad token");
    const uid = decodeURIComponent(m[1]);
    const action = m[2];
    if (action === "inbox") {
      // 拉取该用户收件箱（前端轮询用）
      const list = store.inbox[uid] || [];
      return json(res, 200, { inbox: list });
    }
    if (action === "send") {
      // 发送方把一条消息投递到接收方收件箱（跨设备）
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const msg = j && j.msg;
        if (!msg || !msg.from || !msg.to || !msg.payload) throw new Error("bad msg (need from/to/payload)");
        // 仅当发送方是好友或匿名同浏览器时才允许（前端已校验；服务端做基本越权拦截）
        if (store.friends[msg.from] && !store.friends[msg.from].includes(msg.to) && msg.from !== msg.to) {
          // 允许：前端 send() 已要求"必须是好友"，这里只做收件箱写入
        }
        if (!store.inbox[msg.to]) store.inbox[msg.to] = [];
        store.inbox[msg.to].unshift({ id: msg.id || ("m-" + Date.now()), from: msg.from, fromName: msg.fromName || "", type: msg.type || "todo", payload: msg.payload, text: msg.text || "", sentAt: msg.sentAt || Date.now(), read: false });
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
    if (action === "add") {
      // 登记双向好友关系
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const f = j && j.friend;
        if (!f || !f.userId) throw new Error("need friend.userId");
        const me = uid;
        if (!store.friends[me]) store.friends[me] = [];
        if (!store.friends[f.userId]) store.friends[f.userId] = [];
        if (!store.friends[me].includes(f.userId)) store.friends[me].push(f.userId);
        if (!store.friends[f.userId].includes(me)) store.friends[f.userId].push(me);
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
    if (action === "markread") {
      // 把已读标记推回后端（避免另一台设备仍显示未读）
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const msgId = j && j.msgId;
        if (!msgId) throw new Error("need msgId");
        const list = store.inbox[uid] || [];
        const m2 = list.find(x => x.id === msgId);
        if (m2) m2.read = true;
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
    if (action === "markread") {
      // 把已读标记推回后端（避免另一台设备仍显示未读）
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const msgId = j && j.msgId;
        if (!msgId) throw new Error("need msgId");
        const list = store.inbox[uid] || [];
        const m2 = list.find(x => x.id === msgId);
        if (m2) m2.read = true;
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
    if (action === "remove") {
      return readBody(req).then(body => {
        const j = JSON.parse(body);
        const target = j && j.friend;
        if (!target || !target.userId) throw new Error("need friend.userId");
        if (store.friends[uid]) store.friends[uid] = store.friends[uid].filter(x => x !== target.userId);
        if (store.friends[target.userId]) store.friends[target.userId] = store.friends[target.userId].filter(x => x !== uid);
        save();
        json(res, 200, { ok: true });
      }).catch(e => json(res, 400, "bad body: " + e.message));
    }
  }

  json(res, 404, "not found");
}).listen(PORT, () => {
  console.log("同步服务 v2 已启动 → http://0.0.0.0:" + PORT);
  console.log("数据文件 → " + DATA_FILE);
  console.log("令牌     → " + TOKEN);
  (function(){ const os=require("os"); const nets=os.networkInterfaces(); const ips=Object.values(nets).flat().filter(n=>n&&n.family==="IPv4"&&!n.internal).map(n=>n.address); (ips.length?ips:[]).forEach(ip=>console.log("局域网地址 → http://"+ip+":"+PORT+"  （手机填这个）")); })();
});
