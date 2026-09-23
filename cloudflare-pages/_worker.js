// Cloudflare Pages — Advanced Mode _worker.js
// 路由：/data → 同步接口；其他 → 静态资源
const TOKEN = "wb-12140654b07374a41aebecae";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (url.pathname !== "/data") {
      // 非同步请求 → 交给静态资源
      return env.ASSETS.fetch(request);
    }

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.searchParams.get("token") !== TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }

    const KV = env.KV;
    if (!KV) return new Response(JSON.stringify({ error: "KV not bound" }), { status: 500, headers: cors });

    if (request.method === "GET") {
      const raw = await KV.get("state");
      return new Response(raw ?? JSON.stringify({ rev: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors });
      }
      if (!body || typeof body.data !== "object" || body.data === null) {
        return new Response(JSON.stringify({ error: "missing data" }), { status: 400, headers: cors });
      }
      const cur = JSON.parse((await KV.get("state")) ?? "{}");
      const state = {
        data: body.data,
        rev: (cur.rev || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await KV.put("state", JSON.stringify(state));
      return new Response(JSON.stringify({ ok: true, rev: state.rev, updatedAt: state.updatedAt }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response("method not allowed", { status: 405, headers: cors });
  },
};
