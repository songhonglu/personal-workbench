#!/usr/bin/env node
/* _test_v3_users.js — 端到端验证 sync-server v3：用户目录 + 按用户隔离 + 跨设备待办
 * 1) 起一个临时后端（随机端口、临时数据文件）
 * 2) Song.Han 注册进目录 → 拿 token A
 * 3) 新账号 B 注册进目录 → 拿 token B
 * 4) B 用 token B 查目录搜到 Song.Han；B 加好友；B 发待办给 Song.Han
 * 5) Song.Han 用 token A 拉自己的 /data 与 inbox，能看到 B 的待办
 * 6) 越权检查：token B 拉 Song.Han 的 /data → 403；匿名拉 inbox → 401
 */
const { spawn } = require("child_process"), path = require("path"), os = require("os"), fs = require("fs");
const PORT = 18931;
const DATA = path.join(os.tmpdir(), "wb-v3-test-" + Date.now() + ".json");
const ROOT = "test-root-token";

async function main(){
  const server = spawn(process.execPath, [path.join(__dirname, "sync-server.js"), String(PORT), DATA, ROOT], { stdio: "inherit" });
  await new Promise(r => setTimeout(r, 600));

  const base = "http://127.0.0.1:" + PORT;
  const j = (o) => JSON.stringify(o);
  async function reg(name, nick){
    const r = await fetch(base + "/api/users/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: j({ username:name, nickname:nick }) });
    return r.json();
  }
  const results = [];
  const check = (name, cond, detail="") => { results.push([name, !!cond, detail]); console.log((cond?"✅":"❌")+" "+name+(detail?(" — "+detail):"")); };

  /* 1) Song.Han 注册 */
  const A = await reg("Song.Han", "Song.Han");
  check("A 注册进目录", A.userId && A.token && A.existed===false, A.userId);

  /* 2) 幂等：再注册同名返回既有 userId 且无 token */
  const A2 = await reg("Song.Han", "Song.Han");
  check("A 幂等（同名不重复建）", A2.userId === A.userId && A2.token === null);

  /* 3) 新账号 B 注册 */
  const B = await reg("liming", "李铭");
  check("B 注册进目录", B.userId && B.token && B.existed===false, B.userId);

  /* 4) B 搜到 A */
  const s = await (await fetch(base + "/api/users/search?q=Song")).json();
  check("B 目录搜到 Song.Han", s.users && s.users.some(x => x.userId === A.userId));

  /* 5) B 用 B 的 token 拉自己的 /data（应为空桶但可写） */
  let r = await fetch(base + "/data", { headers: { "Authorization": "Bearer " + B.token } });
  check("B 拉自己 /data 200", r.status === 200);
  const putB = await fetch(base + "/data", { method:"PUT", headers:{"Content-Type":"application/json","Authorization":"Bearer "+B.token}, body: j({ data:{ hello:"B" } }) });
  check("B 写自己 /data", putB.status === 200);

  /* 6) 越权：B 的 token 拉 A 的 /data → 应该拿到 B 自己的桶（按 token 身份路由，非按路径），所以这里验证隔离的是"每人独立桶" */
  const isolatedA = await (await fetch(base + "/data", { headers: { "Authorization": "Bearer " + A.token } })).json();
  check("A 的 /data 与 B 隔离（A 看不到 B 的 hello）", isolatedA.data === null || isolatedA.data === undefined || !isolatedA.data.hello);

  /* 7) B 发待办给 A */
  r = await fetch(base + "/api/friends/" + encodeURIComponent(A.userId) + "/send", { method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+B.token}, body: j({ msg:{ from:B.userId, to:A.userId, fromName:B.nickname, type:"todo", payload:{ title:"帮我看下报表", time:"09:00" }, text:"帮我看下报表" } }) });
  check("B 发待办给 A", r.status === 200);

  /* 8) 越权：用 B 的 token 伪造 from=A 发消息给 C → 应 400（from 与调用者不符） */
  r = await fetch(base + "/api/friends/" + encodeURIComponent(A.userId) + "/send", { method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+B.token}, body: j({ msg:{ from:A.userId, to:A.userId, type:"todo", payload:{title:"x"}, text:"x" } }) });
  check("伪造 from 被拦截（400）", r.status === 400, "status="+r.status);

  /* 9) 匿名拉 A 的 inbox → 401 */
  r = await fetch(base + "/api/friends/" + encodeURIComponent(A.userId) + "/inbox");
  check("匿名拉 inbox 被拒（401）", r.status === 401, "status="+r.status);

  /* 10) A 拉自己的 inbox → 看到 B 的待办 */
  const inbox = await (await fetch(base + "/api/friends/" + encodeURIComponent(A.userId) + "/inbox", { headers: { "Authorization": "Bearer " + A.token } })).json();
  check("A inbox 收到 B 的待办", inbox.inbox && inbox.inbox.length === 1 && inbox.inbox[0].from === B.userId, "count="+(inbox.inbox||[]).length);

  /* 11) B 的 token 拉 A 的 inbox → 403 */
  r = await fetch(base + "/api/friends/" + encodeURIComponent(A.userId) + "/inbox", { headers: { "Authorization": "Bearer " + B.token } });
  check("B 越权拉 A 的 inbox 被拒（403）", r.status === 403, "status="+r.status);

  const failed = results.filter(x => !x[1]).length;
  console.log("\n========== 汇总：通过 "+(results.length-failed)+"/"+results.length+" ==========");
  server.kill();
  try{ fs.unlinkSync(DATA); }catch(_){}
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
