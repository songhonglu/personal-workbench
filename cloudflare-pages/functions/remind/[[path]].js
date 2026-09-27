// Cloudflare Pages Function — v2.0 提醒中心：云端触达（邮箱 / 微信 / 短信）
// 路由：/remind → 按 GET/PUT/OPTIONS + ?action= 分发
//   GET  /remind/config        读取推送配置（KV: remind:config）
//   PUT  /remind/config        保存推送配置
//   GET  /remind/tick          推送派发端点：由外部定时拨号（如 cron-job.org / UptimeRobot，
//                              建议每 5 分钟一次）调用；比对当天应推提醒并去重后发送
//   GET  /remind/test          发送一封测试推送，验证配置是否可用
// 邮件走 Resend（env.RESEND_KEY，env.MAIL_FROM 可选，默认 onboarding@resend.dev）
// 微信走 Server酱（配置里的 wechat SendKey）；短信走通用 webhook（POST JSON）
const TOKEN = "wb-12140654b07374a41aebecae";

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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* UTC+8 的“今天” */
function cnNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
function cnDate(d = cnNow()) { return d.toISOString().slice(0, 10); }
function cnHHmm(d = cnNow()) { return d.toISOString().slice(11, 16); }
function daysTo(md) {
  const now = cnNow();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let t = new Date(now.getFullYear(), +md.slice(0, 2) - 1, +md.slice(3, 5));
  if (t < today0) t = new Date(now.getFullYear() + 1, +md.slice(0, 2) - 1, +md.slice(3, 5));
  return Math.round((t - today0) / 86400000);
}

/* ---------- 通道发送 ---------- */
async function sendEmail(cfg, subject, text) {
  if (!cfg.email) return { channel: "email", skipped: "未配置邮箱" };
  const key = (globalThis.__env && globalThis.__env.RESEND_KEY) || "";
  if (!key) return { channel: "email", skipped: "未配置 RESEND_KEY（在 Pages 环境变量中设置）" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: (globalThis.__env && globalThis.__env.MAIL_FROM) || "个人工作台 <onboarding@resend.dev>",
      to: [cfg.email],
      subject,
      text,
    }),
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
  const r = await fetch(cfg.sms, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.ok ? { channel: "sms", sent: true } : { channel: "sms", error: "HTTP " + r.status };
}

/* ---------- 生成当天应推送的提醒 ---------- */
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

/* ---------- KV 幂等集合 ---------- */
async function getSentSet(KV, dstr) {
  const raw = await KV.get("remind:sent:" + dstr);
  try { return new Set(JSON.parse(raw || "[]")); } catch { return new Set(); }
}
async function saveSentSet(KV, dstr, set) {
  await KV.put("remind:sent:" + dstr, JSON.stringify([...set]), { expirationTtl: 172800 });
}

export async function onRequest(context) {
  const { request, env } = context;
  globalThis.__env = env;
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (url.searchParams.get("token") !== TOKEN) return json({ error: "unauthorized" }, 401);
  const KV = env.KV;
  if (!KV) return json({ error: "KV not bound" }, 500);

  const seg0 = context.params && context.params.path;
  const seg = Array.isArray(seg0) ? seg0[0] : seg0;
  const action = seg || url.searchParams.get("action") || "config";

  /* GET /remind?action=config（兼容 /remind/config 由 action 解析） */
  if (request.method === "GET" && action === "config") {
    const raw = await KV.get("remind:config");
    const config = raw ? JSON.parse(raw) : { enabled: false, email: "", wechat: "", sms: "", advance: 0 };
    return json({ config });
  }

  if (request.method === "PUT" && action === "config") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
    const config = {
      enabled: !!body.enabled,
      email: String(body.email || "").slice(0, 120),
      wechat: String(body.wechat || "").slice(0, 80),
      sms: String(body.sms || "").slice(0, 300),
      advance: [0, 1, 3].includes(+body.advance) ? +body.advance : 0,
      updatedAt: new Date().toISOString(),
    };
    await KV.put("remind:config", JSON.stringify(config));
    return json({ ok: true, config });
  }

  if (request.method === "GET" && (action === "tick" || action === "test")) {
    const raw = await KV.get("remind:config");
    const cfg = raw ? JSON.parse(raw) : {};
    if (!cfg.enabled) return json({ ok: true, skipped: "云端推送未启用" });
    if (action === "test") {
      const title = "工作台测试推送";
      const text = "这是一封测试推送（" + cnDate() + " " + cnHHmm() + " UTC+8）。\n配置正常的话，邮箱 / 微信会收到本条消息。";
      const rs = await Promise.allSettled([sendEmail(cfg, title, text), sendWechat(cfg, title, text), sendSms(cfg, { title, content: text, date: cnDate() })]);
      return json({ ok: true, results: rs.map(r => r.value || { error: String(r.reason) }) });
    }
    /* tick：读用户数据 → 生成当天应推项 → 幂等过滤 → 发送 */
    const stRaw = await KV.get("state");
    let data = null;
    try { data = (JSON.parse(stRaw || "{}") || {}).data || null; } catch { data = null; }
    if (!data) return json({ ok: true, skipped: "暂无同步数据" });
    const items = buildTodayItems(data, cfg);
    if (!items.length) return json({ ok: true, date: cnDate(), sent: [] });
    const sent = await getSentSet(KV, cnDate());
    const pending = items.filter(i => !sent.has(i.key));
    if (!pending.length) return json({ ok: true, date: cnDate(), sent: [], dedup: items.length });
    const profile = data.profile || {};
    const results = [];
    for (const it of pending) {
      const text = it.text + "\n\n—— 来自个人工作台云端提醒" + (profile.nickname ? "（" + profile.nickname + "）" : "");
      const rs = await Promise.allSettled([sendEmail(cfg, "【工作台提醒】" + it.title, text), sendWechat(cfg, "【工作台提醒】" + it.title, text), sendSms(cfg, { title: it.title, content: it.text, phone: profile.phone || "", date: cnDate() })]);
      results.push(...rs.map(r => r.value || { error: String(r.reason) }));
      sent.add(it.key);
    }
    await saveSentSet(KV, cnDate(), sent);
    return json({ ok: true, date: cnDate(), sentCount: pending.length, results });
  }

  return json({ error: "method not allowed" }, 405);
}
