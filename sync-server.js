#!/usr/bin/env node
/* ============================================================
   工作台多端同步服务器 —— 零依赖单文件，Node 14+ 直接运行
   用法：node sync-server.js [端口] [数据文件]
   默认：端口 8788（本机 8787 已被其他服务占用），数据存同目录 workbench-sync-data.json
   令牌：环境变量 SYNC_TOKEN，或默认 "song-workbench-2026"（建议自行修改）

   协议（与工作台内置同步客户端完全一致）：
     GET /data?token=xxx   → { data, rev, updatedAt }        读取
     PUT /data?token=xxx   body { data } → { rev, updatedAt } 写入并 rev+1
   ============================================================ */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");

const PORT = Number(process.argv[2]) || 8788;
const DATA_FILE = process.argv[3] || path.join(__dirname, "workbench-sync-data.json");
const TOKEN = process.env.SYNC_TOKEN || "song-workbench-2026"; // ← 建议改成一段足够长的随机密钥

let store = { data: null, rev: 0, updatedAt: null };
try { store = Object.assign(store, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); } catch (e) {}
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(store));

const os = require("os");
const nets = os.networkInterfaces();
const lanIps = Object.values(nets).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n.address);

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (u.pathname !== "/data") { res.writeHead(404, cors); return res.end("not found"); }
  if (u.query.token !== TOKEN) { res.writeHead(403, cors); return res.end(JSON.stringify({ error: "bad token" })); }

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    return res.end(JSON.stringify(store.data == null ? { data: null, rev: 0, updatedAt: null } : store));
  }
  if (req.method === "PUT") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on("end", () => {
      try {
        const j = JSON.parse(body);
        if (!j || typeof j !== "object" || !("data" in j)) throw new Error("bad body");
        store.data = j.data; store.rev += 1; store.updatedAt = new Date().toISOString();
        save();
        res.writeHead(200, { "Content-Type": "application/json", ...cors });
        res.end(JSON.stringify({ rev: store.rev, updatedAt: store.updatedAt }));
      } catch (e) { res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  res.writeHead(405, cors); res.end();
}).listen(PORT, () => {
  console.log("同步服务已启动 → http://0.0.0.0:" + PORT);
  console.log("数据文件 → " + DATA_FILE);
  console.log("令牌     → " + TOKEN);
  (lanIps.length ? lanIps : []).forEach(ip => console.log("局域网地址 → http://" + ip + ":" + PORT + "  （手机填这个）"));
});
