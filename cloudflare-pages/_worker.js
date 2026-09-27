// Cloudflare Pages — Advanced Mode _worker.js
// 路由：/data → 同步接口；/remind/* → v2.0 云端提醒触达；其他 → 静态资源
//   GET  /remind/config  读取推送配置（KV: remind:config）
//   PUT  /remind/config  保存推送配置
//   GET  /remind/tick    推送派发端点：由外部定时拨号（cron-job.org / UptimeRobot，建议 5 分钟）调用
//   GET  /remind/test    发送测试推送验证配置
// 邮件走 Resend（env.RESEND_KEY，env.MAIL_FROM 可选）；微信走 Server酱；短信走通用 webhook
const TOKEN = "wb-12140654b07374a41aebecae";

/* ---------- v2.0 提醒触达 ---------- */
/* 2026 年法定节假日（国办发明电〔2025〕7号）——与前端保持一致 */
const HOLIDAY_2026_OFF = {
  "01-01":"元旦","01-02":"元旦","01-03":"元旦",
  "02-15":"春节","02-16":"春节","02-17":"春节","02-18":"春节","02-19":"春节","02-20":"春节","02-21":"春节","02-22":"春节","02-23":"春节",
  "04-04":"清明","04-05":"清明","04-06":"清明",
  "05-01":"劳动节","05-02":"劳动节","05-03":"劳动节","05-04":"劳动节","05-05":"劳动节",
  "06-19":"端午","06-20":"端午","06-21":"端午",
  "09-25":"中秋","09-26":"中秋","09-27":"中秋",
  "10-01":"国庆","10-02":"国庆","10-03":"国庆","10-04":"国庆","10-05":"国庆","10-06":"国庆","10-07":"国庆",
};
const HOLIDAY_2026_WORK = {
  "01-04":"元旦调休","02-14":"春节调休","02-28":"春节调休","05-09":"劳动节调休","09-20":"国庆调休","10-10":"国庆调休",
};
const rjson = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

/* UTC+8 的“今天” */
function cnNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
function cnDate(d = cnNow()) { return d.toISOString().slice(0, 10); }
function daysTo(md) {
  const now = cnNow();
  const today0 = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let t = new Date(now.getUTCFullYear(), +md.slice(0, 2) - 1, +md.slice(3, 5));
  if (t < today0) t = new Date(now.getUTCFullYear() + 1, +md.slice(0, 2) - 1, +md.slice(3, 5));
  return Math.round((t - today0) / 86400000);
}

async function sendEmail(cfg, subject, text, env) {
  if (!cfg.email) return { channel: "email", skipped: "未配置邮箱" };
  if (!env.RESEND_KEY) return { channel: "email", skipped: "未配置 RESEND_KEY（在 Pages 环境变量中设置）" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "个人工作台 <onboarding@resend.dev>", to: [cfg.email], subject, text }),
  });
  return r.ok ? { channel: "email", sent: true } : { channel: "email", error: "HTTP " + r.status + " " + (await r.text()).slice(0, 200) };
}
async function sendWechat(cfg, title, text) {
  if (!cfg.wechat) return { channel: "wechat", skipped: "未配置 Server酱 SendKey" };
  const r = await fetch("https://sctapi.ftqq.com/" + encodeURIComponent(cfg.wechat) + ".send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ title, desp: text }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  return (r.ok && j.code === 0) ? { channel: "wechat", sent: true } : { channel: "wechat", error: "code=" + (j.code ?? r.status) };
}
async function sendSms(cfg, payload) {
  if (!cfg.sms) return { channel: "sms", skipped: "未配置短信 webhook" };
  const r = await fetch(cfg.sms, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return r.ok ? { channel: "sms", sent: true } : { channel: "sms", error: "HTTP " + r.status };
}

function buildTodayItems(data, cfg) {
  const items = [];
  const dstr = cnDate();
  const md = dstr.slice(5);
  const list = (data && Array.isArray(data.remind)) ? data.remind : [];
  const ahead = +(cfg.advance || 0);
  for (const it of list) {
    if (!it || it.enabled === false || it.done) continue;
    if (it.type === "birthday" || it.type === "anniv") {
      const imd = String(it.date || "").slice(5);
      if (imd.length !== 5) continue;
      const diff = daysTo(imd);
      if (diff === 0) items.push({ key: "d-" + it.id + "-" + dstr, title: it.title || "纪念日", text: it.type === "birthday" ? "今天是生日，祝生日快乐！🎂" : "今天是「" + it.title + "」纪念日 ❤️" });
      else if (ahead > 0 && diff === ahead) items.push({ key: "d-" + it.id + "-" + dstr + "-a", title: it.title || "纪念日", text: "「" + it.title + "」还有 " + ahead + " 天就到了，记得准备。" });
    }
  }
  const holOff = HOLIDAY_2026_OFF[md], holWork = HOLIDAY_2026_WORK[md];
  if (holOff) items.push({ key: "h-" + dstr, title: holOff + "假期", text: "今天是" + holOff + "假期，放假啦，好好休息 🎉" });
  else if (holWork) items.push({ key: "h-" + dstr, title: holWork, text: "今天是" + holWork + "，记得上班 ☕" });
  return items;
}
async function getSentSet(KV, dstr) {
  try { return new Set(JSON.parse((await KV.get("remind:sent:" + dstr)) || "[]")); } catch { return new Set(); }
}
async function saveSentSet(KV, dstr, set) {
  await KV.put("remind:sent:" + dstr, JSON.stringify([...set]), { expirationTtl: 172800 });
}

async function remindHandler(request, env, KV, cors) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/remind\/?/, "").split("/")[0] || "config";

  if (request.method === "GET" && seg === "config") {
    const raw = await KV.get("remind:config");
    return rjson({ config: raw ? JSON.parse(raw) : { enabled: false, email: "", wechat: "", sms: "", advance: 0 } });
  }
  if (request.method === "PUT" && seg === "config") {
    let body;
    try { body = await request.json(); } catch { return rjson({ error: "bad json" }, 400); }
    const config = {
      enabled: !!body.enabled,
      email: String(body.email || "").slice(0, 120),
      wechat: String(body.wechat || "").slice(0, 80),
      sms: String(body.sms || "").slice(0, 300),
      advance: [0, 1, 3].includes(+body.advance) ? +body.advance : 0,
      updatedAt: new Date().toISOString(),
    };
    await KV.put("remind:config", JSON.stringify(config));
    return rjson({ ok: true, config });
  }
  if (request.method === "GET" && (seg === "tick" || seg === "test")) {
    const cfgRaw = await KV.get("remind:config");
    const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
    if (!cfg.enabled) return rjson({ ok: true, skipped: "云端推送未启用" });
    if (seg === "test") {
      const title = "工作台测试推送";
      const text = "这是一封测试推送（" + cnDate() + " UTC+8）。\n配置正常的话，邮箱 / 微信会收到本条消息。";
      const rs = await Promise.allSettled([sendEmail(cfg, title, text, env), sendWechat(cfg, title, text), sendSms(cfg, { title, content: text, date: cnDate() })]);
      return rjson({ ok: true, results: rs.map(r => r.value || { error: String(r.reason) }) });
    }
    const stRaw = await KV.get("state");
    let data = null;
    try { data = (JSON.parse(stRaw || "{}") || {}).data || null; } catch { data = null; }
    if (!data) return rjson({ ok: true, skipped: "暂无同步数据" });
    const items = buildTodayItems(data, cfg);
    if (!items.length) return rjson({ ok: true, date: cnDate(), sent: [] });
    const sent = await getSentSet(KV, cnDate());
    const pending = items.filter(i => !sent.has(i.key));
    if (!pending.length) return rjson({ ok: true, date: cnDate(), sent: [], dedup: items.length });
    const profile = data.profile || {};
    const results = [];
    for (const it of pending) {
      const text = it.text + "\n\n—— 来自个人工作台云端提醒" + (profile.nickname ? "（" + profile.nickname + "）" : "");
      const rs = await Promise.allSettled([sendEmail(cfg, "【工作台提醒】" + it.title, text, env), sendWechat(cfg, "【工作台提醒】" + it.title, text), sendSms(cfg, { title: it.title, content: it.text, phone: profile.phone || "", date: cnDate() })]);
      results.push(...rs.map(r => r.value || { error: String(r.reason) }));
      sent.add(it.key);
    }
    await saveSentSet(KV, cnDate(), sent);
    return rjson({ ok: true, date: cnDate(), sentCount: pending.length, results });
  }
  return rjson({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (url.pathname === "/remind" || url.pathname.startsWith("/remind/")) {
      if (request.method === "OPTIONS") return new Response(null, { headers: cors });
      if (url.searchParams.get("token") !== TOKEN) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
      }
      const KV = env.KV;
      if (!KV) return new Response(JSON.stringify({ error: "KV not bound" }), { status: 500, headers: cors });
      return remindHandler(request, env, KV, cors);
    }

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
