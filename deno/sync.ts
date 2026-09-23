// 个人工作台 · 云端同步服务 (Deno Deploy)
// 协议与 Cloudflare Worker 完全一致：
//   GET  /data?token=xxx  -> { data, rev, updatedAt }  （无数据时 { rev:0 }）
//   PUT  /data?token=xxx  body { data }  -> { ok:true, rev, updatedAt }
// 存储用 Deno KV，rev 每次写入自增。

const TOKEN = Deno.env.get("TOKEN") || "wb-12140654b07374a41aebecae";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (url.pathname !== "/data") return new Response("not found", { status: 404, headers: cors });
  if (url.searchParams.get("token") !== TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  const kv = await Deno.openKv();

  if (req.method === "GET") {
    const res = await kv.get(["state"]);
    return new Response(res.value ? JSON.stringify(res.value) : JSON.stringify({ rev: 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors });
    }
    if (!body || typeof body.data !== "object" || body.data === null) {
      return new Response(JSON.stringify({ error: "missing data" }), { status: 400, headers: cors });
    }
    const cur = (await kv.get(["state"])).value || {};
    const state = {
      data: body.data,
      rev: (cur.rev || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(["state"], state);
    return new Response(JSON.stringify({ ok: true, rev: state.rev, updatedAt: state.updatedAt }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response("method not allowed", { status: 405, headers: cors });
});
