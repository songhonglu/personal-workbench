/**
 * 个人工作台 · 云端同步 Worker
 * 协议与本地 sync-server.js 完全一致：
 *   GET  /data?token=xxx  -> { data, rev, updatedAt }  （无数据时 { rev:0 }）
 *   PUT  /data?token=xxx  body { data }  -> { ok:true, rev, updatedAt }
 * 数据存 Workers KV 单键 state，rev 每次写入自增。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname !== "/data") return new Response("not found", { status: 404, headers: cors });
    if (url.searchParams.get("token") !== env.TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }

    if (request.method === "GET") {
      const raw = await env.KV.get("state");
      return new Response(raw ?? JSON.stringify({ rev: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      let body;
      try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors });
      }
      if (!body || typeof body.data !== "object" || body.data === null) {
        return new Response(JSON.stringify({ error: "missing data" }), { status: 400, headers: cors });
      }
      const cur = JSON.parse((await env.KV.get("state")) ?? "{}");
      const state = {
        data: body.data,
        rev: (cur.rev || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await env.KV.put("state", JSON.stringify(state));
      return new Response(JSON.stringify({ ok: true, rev: state.rev, updatedAt: state.updatedAt }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response("method not allowed", { status: 405, headers: cors });
  },
};
