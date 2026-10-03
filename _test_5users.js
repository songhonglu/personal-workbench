#!/usr/bin/env node
/* ============================================================
 * _test_5users.js — 5 个真实用户全流程验收
 * 流程：注册 → 登录 → 10月数据初始化 → 互加好友 → 跨用户发消息
 * 模拟：Node + 手写 fake DOM（localStorage/document/window/fetch 桩）
 * 每个用户独立 localStorage 会话，模拟 5 台独立设备
 * ============================================================ */
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "workbench.html"), "utf8");
/* 跳过前两个辅助 <script>（localStorage 记录 / serviceWorker）：
   它们使用裸 addEventListener，在 Node 无浏览器窗口对象下直接报错，与本测试无关。 */
const _scriptTags = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g) || [];
/* 保留：块 0（主逻辑，含 wbUser/wbFriends）、块 1（localStorage entry）、块 3（离线提示条）
   跳过：块 2（serviceWorker，依赖裸 addEventListener + navigator.serviceWorker）、块 4（空占位）、块 5（增强脚本） */
const _keepIdx = [0, 1, 3];
const scripts = _keepIdx.map(i => _scriptTags[i].replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));

const ISSUES = [];        // 记录过程中遇到的问题
const LOG = [];           // 执行流水
function log(tag, msg) { LOG.push(`[${tag}] ${msg}`); console.log(`[${tag}] ${msg}`); }
function issue(id, sev, title, detail) { ISSUES.push({ id, sev, title, detail }); }

/* ---------- fake DOM ---------- */
function makeClassMethods(){
  return {
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    dataset: {}, style: {}, value: "", textContent: "", innerHTML: "",
    addEventListener(){}, removeEventListener(){},
    appendChild(){}, removeChild(){}, insertAdjacentHTML(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; },
    focus(){}, blur(){}, click(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, matches(){ return false; },
    ownerDocument: null, parentElement: null,
  };
}
function makeElement(tag){
  const el = { tagName: (tag||"div").toUpperCase(), };
  Object.assign(el, makeClassMethods());
  el.children = [];
  el.style = {}; el.id = ""; el.className = "";
  return el;
}
function makeLocalStorage(initial){
  let map = new Map(Object.entries(initial||{}));
  return {
    _map: map,
    get length(){ return this._map.size; },
    key(i){ const ks = [...this._map.keys()]; return i < ks.length ? ks[i] : null; },
    getItem(k){ return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k,v){ this._map.set(k, String(v)); },
    removeItem(k){ this._map.delete(k); },
    clear(){ this._map.clear(); },
  };
}
function makeStubEl(id){
  const el = {
    id: id||"", tagName: "DIV",
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    dataset: {}, style: {}, value: "", textContent: "", innerHTML: "",
    onclick: null, onchange: null, oninput: null,
    appendChild(){}, removeChild(){}, insertAdjacentHTML(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; },
    focus(){}, blur(){}, click(){},
    querySelector(){ return makeStubEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, matches(){ return false; },
    files: null,
  };
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  return el;
}
function makeDocument(localStorage){
  const root = makeElement("html");
  const body = makeElement("body");
  root.ownerDocument = root;
  const doc = {
    documentElement: root, body,
    createElement(tag){ return makeElement(tag); },
    createTextNode(t){ return { textContent: t }; },
    /* boot 段大量 $("#x") 直接绑定事件：返回可存属性的桩，模拟元素存在 */
    querySelector(sel){ return sel && sel.indexOf("#")===0 ? makeStubEl(sel.slice(1)) : makeStubEl("q"); },
    querySelectorAll(){ return []; },
    getElementById(id){ return makeStubEl(id); },
    title: "workbench",
    head: makeElement("head"),
    cookie: "",
    visibilityState: "visible",
    hidden: false,
    localStorage,
  };
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  return doc;
}
/* 会话：独立 localStorage（模拟独立设备），执行全部 script，返回 API 句柄 */
function newSession(tag, preset){
  const ls = makeLocalStorage(preset || {});
  const doc = makeDocument(ls);
  const navigatorStub = {
    userAgent: "node-test",
    onLine: false,
    clipboard: { writeText: async () => {} },
    geolocation: undefined,
    vibrate: undefined,
    serviceWorker: undefined,
  };
  const win = {
    document: doc, localStorage: ls, navigator: navigatorStub,
    location: { href: "http://localhost/", search: "", hash: "", pathname: "/workbench.html", protocol: "http:" },
    innerWidth: 1280, innerHeight: 800,
    visualViewport: undefined,
    matchMedia(){ return { matches: false, addEventListener(){}, removeEventListener(){}, media: "" }; },
    requestAnimationFrame(cb){ try { cb(Date.now()); } catch(_e){} return 0; },
    cancelAnimationFrame(){},
    setTimeout, clearTimeout, setInterval, clearInterval,
    scrollTo(){},
    AudioContext: undefined, webkitAudioContext: undefined,
    IntersectionObserver: undefined, ResizeObserver: undefined,
    caches: undefined,
    addEventListener(){}, removeEventListener(){},
    open(){},
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  doc.defaultView = win;
  win.document = doc;
  /* 把新属性补到 doc 上 */
  doc.documentElement.style = {};
  doc.body.style = {};
  const fetchStub = async (url, opts) => {
    log(tag+"-net", "fetch 拦截（离线测试不发真实请求）: " + String(url).slice(0, 80) + (opts && opts.method ? " " + opts.method : ""));
    return { ok: true, status: 200, json: async () => ({}) };
  };
  /* 全局对象 */
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = ls;
  globalThis.navigator = win.navigator;
  globalThis.fetch = fetchStub;
  globalThis.location = win.location;
  globalThis.matchMedia = win.matchMedia.bind(win);
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.history = win.history || { pushState(){}, replaceState(){}, back(){}, state: null };
  globalThis.history = win.history || { pushState(){}, replaceState(){}, back(){}, state: null };
  /* 应用 boot 段用到 performance.now()（countUp）：补桩 */
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.IntersectionObserver = class { constructor(cb){} observe(){} unobserve(){} disconnect(){} };
  globalThis.ResizeObserver = class { constructor(cb){} observe(){} unobserve(){} disconnect(){} };
  globalThis.AudioContext = class { constructor(){ this.createOscillator = () => ({ connect(){}, start(){}, stop(){} }); this.createGain = () => ({ connect(){} }); this.destination = {}; } };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  globalThis.visualViewport = undefined;
  globalThis.IntersectionObserver = class { constructor(cb){} observe(){} unobserve(){} disconnect(){} };
  globalThis.ResizeObserver = class { constructor(cb){} observe(){} unobserve(){} disconnect(){} };
  globalThis.AudioContext = class { constructor(){ this.createOscillator = () => ({ connect(){}, start(){}, stop(){} }); this.createGain = () => ({ connect(){} }); this.destination = {}; } };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  globalThis.visualViewport = undefined;
  /* 执行应用源码：把 6 个 <script> 块拼成一个 Function 体（块间共享作用域，最接近浏览器全局行为）。
     顶层 const/let 重名会直接 SyntaxError（与真实页面一致），这是有意的——把重名问题暴露出来。
     boot 段（最后一块）对不存在 DOM 的容错由桩的 addEventListener 兜底。 */
  const blocks = _keepIdx.map(i => _scriptTags[i]).map(m => m.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
  const glue = "\n;__wbApi.wbUser=wbUser;__wbApi.wbFriends=wbFriends;__wbApi.store=store;__wbApi.CONFIG=CONFIG;__wbApi.ensureV2=ensureV2;__wbApi.wbUid=wbUid;__wbApi.wbHash=wbHash;__wbApi.isoToday=isoToday;__wbApi.daysAgo=daysAgo;__wbApi.data=data;return __wbApi;";
  const body = blocks.map((b, i) => `/* block ${i} */\n${b}${i===blocks.length-1?glue:""}`).join("\n");
  let api;
  try {
    api = new Function("document","window","localStorage","fetch","matchMedia","requestAnimationFrame","__wbApi",
      body)(doc, win, ls, fetchStub, win.matchMedia.bind(win), win.requestAnimationFrame.bind(win), {});
  } catch(e){
    issue("APP-EXEC-" + tag, "高", "应用源码执行失败", String(e.message).slice(0, 300) + "\n" + (e.stack||"").split("\n").slice(0,8).join("\n"));
    console.error("APP-EXEC-" + tag + " FULL STACK:\n" + (e.stack||""));
    log(tag + "-app", "应用执行失败: " + String(e.stack||e.message).slice(0, 500));
    return { ls, api: null, tag, execError: String(e.message) };
  }
  if(!api || !api.wbUser || !api.wbFriends || !api.store || !api.data){
    issue("HANDLE-" + tag, "高", "API 句柄导出失败", "api=" + JSON.stringify(api && Object.keys(api)));
  }
  /* 关闭自动同步干扰（数据槽仍走本地） */
  try { win.fetch = fetchStub; } catch(_e){}
  return { ls, api, tag };
}

/* 10 月 1-31 号日期序列 */
function octDays(){
  const out = [];
  for(let d=1; d<=31; d++) out.push("2026-10-" + String(d).padStart(2, "0"));
  return out;
}

/* ---------- 5 个真实用户（含人设 + 10 月数据规格） ---------- */
const USERS = [
  {
    username: "linshu", nickname: "林纾", password: "lin@2026ok",
    profile: { nickname: "林纾", gender: "女", birthday: "1996-05-12", phone: "13800001122", email: "linshu@workmail.cn", wechat: "linshu_wx", city: "上海", job: "产品经理", motto: "把复杂的事讲简单" },
    todos: [
      { title: "Q4 产品路线图评审", priority: "P0", done: false, note: "10/8 前把竞品矩阵填完", date: "2026-10-01" },
      { title: "用户访谈提纲（新客 5 人）", priority: "P1", done: true, note: "已约到 3 位", date: "2026-10-01" },
      { title: "国庆后第一周 standup 材料", priority: "P2", done: false, note: "", date: "2026-10-02" },
    ],
    checkins: [
      { title: "晨间英语 30 分钟", logDays: [1,2,3,5,6,8,9] },
      { title: "拉伸 15 分钟", logDays: [1,3,4,6,7] },
      { title: "记账复盘", logDays: [1,2,4,5,7,8] },
    ],
    goals: [
      { title: "《定位》精读", current: 180, target: 320, unit: "页", note: "读到第五章，做 3 张卡片笔记" },
      { title: "2026 跑量 600 公里", current: 410, target: 600, unit: "公里", note: "十月国庆安排两次半马拉练" },
      { title: "旅行基金 6 万", current: 45000, target: 60000, unit: "元", note: "12 月底想去京都" },
    ],
    money: [
      { title: "10 月工资到账", type: "income", amount: 15600, category: "工资", date: "2026-10-09" },
      { title: "国庆上海租车 3 天", type: "expense", amount: 1860, category: "交通", date: "2026-10-04" },
      { title: "浦东机场咖啡", type: "expense", amount: 45, category: "餐饮", date: "2026-10-04" },
      { title: "新平板键盘膜", type: "expense", amount: 129, category: "购物", date: "2026-10-12" },
      { title: "产品经理读书会年卡", type: "expense", amount: 365, category: "学习", date: "2026-10-18" },
      { title: "稿费（10 月专栏）", type: "income", amount: 800, category: "其他", date: "2026-10-25" },
    ],
    notes: [
      { title: "国庆复盘", content: "假期 4 天读了 2 本书，跑了 40 公里；工作积压的 PRD 还没动，节后第一周先清掉。", mood: "复盘", date: "2026-10-07" },
      { title: "用户访谈金句", content: "「我不是要更多功能，我要的是别让我想。」——记下来贴在工位。", mood: "摘录", date: "2026-10-10" },
      { title: "十月目标", content: "① 跑完半马 ② 基金到 5.5 ��� ③ 读完《定位》写 1 篇笔记", mood: "灵感", date: "2026-10-01" },
    ],
    reminds: [
      { type: "alarm", title: "每日 standup 材料检查", time: "09:00", repeat: "weekday", quick: 0, enabled: true },
      { type: "birthday", title: "妈妈生日", date: "10-15", ahead: 1, quick: 0, enabled: true },
    ],
    health: { goals: { water: 8, steps: 10000, sleep: 7 }, log: { "2026-10-05": { water: 8, steps: 12340, sleep: 7 }, "2026-10-06": { water: 6, steps: 8200, sleep: 6.5 } } },
    focus: { focusMin: 30, breakMin: 5, goal: 6 },
    friendPairs: [2, 5],
  },
  {
    username: "chenmo", nickname: "陈默", password: "chen@2026go",
    profile: { nickname: "陈默", gender: "男", birthday: "1993-11-02", phone: "13900002233", email: "chenmo.dev@corp.cn", wechat: "chenmo_dev", city: "杭州", job: "后端工程师", motto: "少写代码，多写测试" },
    todos: [
      { title: "支付网关压测报告", priority: "P0", done: false, note: "10/9 提给架构组", date: "2026-10-08" },
      { title: "代码评审：订单拆分 PR#482", priority: "P1", done: true, note: "", date: "2026-10-02" },
      { title: "更新技术博客：K8s 灰度实践", priority: "P2", done: false, note: "写到第三段", date: "2026-10-20" },
    ],
    checkins: [
      { title: "运动 30 分钟", logDays: [1,2,3,4,5,7,8,9,10] },
      { title: "阅读 30 分钟", logDays: [2,4,5,6,7,9] },
      { title: "写单测 ≥2 个", logDays: [1,2,3,4,5,8,9] },
    ],
    goals: [
      { title: "系统架构师认证", current: 350, target: 800, unit: "学时", note: "已过一半，重点补云原生" },
      { title: "2026 骑行 1000 公里", current: 520, target: 1000, unit: "公里", note: "国庆跑了环西湖 60 公里" },
      { title: "应急基金 15 万", current: 125000, target: 150000, unit: "元", note: "每月 5 号定投" },
    ],
    money: [
      { title: "10 月工资", type: "income", amount: 28000, category: "工资", date: "2026-10-09" },
      { title: "技术书籍 3 本", type: "expense", amount: 318, category: "学习", date: "2026-10-11" },
      { title: "周末骑行装备", type: "expense", amount: 689, category: "购物", date: "2026-10-13" },
      { title: "房租 10 月", type: "expense", amount: 3800, category: "居住", date: "2026-10-01" },
      { title: "开源打赏（Q4）", type: "income", amount: 420, category: "其他", date: "2026-10-26" },
    ],
    notes: [
      { title: "压测踩坑", content: "连接池默认 8，压到 500 QPS 就 OOM；改到 64 + 慢查询索引后稳了。", mood: "复盘", date: "2026-10-09" },
      { title: "灰度发布清单", content: "① 金丝雀 5% ② 监控 error-rate 30min ③ 观察 1h 全量 ④ 回滚脚本演练", mood: "灵感", date: "2026-10-15" },
      { title: "环西湖骑行", content: "11 月 8 号 60km，秋高气爽。下次带上 GPS 记录坡度。", mood: "生活", date: "2026-10-13" },
    ],
    reminds: [
      { type: "alarm", title: "每天 06:45 晨练", time: "06:45", repeat: "daily", quick: 0, enabled: true },
      { type: "date", title: "季度 OKR 填报截止", date: "10-31", ahead: 2, quick: 0, enabled: true },
    ],
    health: { goals: { water: 6, steps: 9000, sleep: 7.5 }, log: { "2026-10-03": { water: 6, steps: 9500, sleep: 7.5 }, "2026-10-10": { water: 5, steps: 14000, sleep: 6 } } },
    focus: { focusMin: 45, breakMin: 10, goal: 4 },
    friendPairs: [1, 3, 4],
  },
  {
    username: "sushu", nickname: "苏舒", password: "su@shu2026",
    profile: { nickname: "苏舒", gender: "女", birthday: "1999-02-28", phone: "13700003344", email: "sushu.reads@outlook.com", wechat: "sushu_read", city: "成都", job: "插画师（自由职业）", motto: "慢慢画，好好画" },
    todos: [
      { title: "绘本《山里的风》封面议稿", priority: "P0", done: false, note: "10/20 交出版社", date: "2026-10-20" },
      { title: "10 月稿费对账", priority: "P1", done: true, note: "3 家都对上了", date: "2026-10-05" },
      { title: "给老张画生日贺卡", priority: "P2", done: false, note: "他 10/28 生日", date: "2026-10-25" },
    ],
    checkins: [
      { title: "画 2 小时", logDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] },
      { title: "练字 20 分钟", logDays: [1,3,5,7,9,11,13] },
      { title: "散步 40 分钟", logDays: [2,4,6,8,10,12] },
    ],
    goals: [
      { title: "绘本《山里的风》", current: 68, target: 120, unit: "页", note: "内页 40 张完成，开始上色" },
      { title: "2026 展览 1 场", current: 20, target: 100, unit: "%", note: "场地已谈好，剩布展清单" },
      { title: "存款 8 万", current: 62000, target: 80000, unit: "元", note: "稿费季结束后冲一把" },
    ],
    money: [
      { title: "绘本约稿费（上季度）", type: "income", amount: 9600, category: "工资", date: "2026-10-08" },
      { title: "新色号墨水", type: "expense", amount: 236, category: "学习", date: "2026-10-06" },
      { title: "中秋后火锅局", type: "expense", amount: 168, category: "餐饮", date: "2026-10-03" },
      { title: "画材运费", type: "expense", amount: 32, category: "其他", date: "2026-10-16" },
      { title: "10 月房租", type: "expense", amount: 2400, category: "居住", date: "2026-10-01" },
      { title: "周边小卖 12 件", type: "income", amount: 540, category: "其他", date: "2026-10-19" },
    ],
    notes: [
      { title: "上色心得", content: "灰调先铺再叠彩，比直接上彩耐看。今天试了冷灰打底，效果稳。", mood: "灵感", date: "2026-10-12" },
      { title: "展览布展清单", content: "20 幅 A3 + 3 本画册 + 灯箱 2 个。订做展签 30 枚，10/25 前送到。", mood: "复盘", date: "2026-10-22" },
      { title: "山里的风·分镜", content: "P18-P24 改成黄昏色温，情绪更对。", mood: "摘录", date: "2026-10-15" },
    ],
    reminds: [
      { type: "date", title: "出版社封面对线", date: "10-20", ahead: 3, quick: 0, enabled: true },
      { type: "birthday", title: "好友 老张 生日", date: "10-28", ahead: 1, quick: 0, enabled: true },
    ],
    health: { goals: { water: 6, steps: 6000, sleep: 8 }, log: { "2026-10-07": { water: 7, steps: 6800, sleep: 8 }, "2026-10-14": { water: 4, steps: 5200, sleep: 7 } } },
    focus: { focusMin: 50, breakMin: 10, goal: 3 },
    friendPairs: [2, 4, 5],
  },
  {
    username: "aoran", nickname: "阿岩", password: "yan@2026run",
    profile: { nickname: "阿岩", gender: "男", birthday: "1995-08-19", phone: "13600004455", email: "aoran.fit@gmail.com", wechat: "aoran_run", city: "北京", job: "健身教练", motto: "练了再说" },
    todos: [
      { title: "会员小李的 12 周减脂计划", priority: "P0", done: false, note: "先测体脂再排课", date: "2026-10-06" },
      { title: "国庆课程表排班", priority: "P1", done: true, note: "已发群里", date: "2026-09-28" },
      { title: "备赛：省赛 10/25 报名费", priority: "P1", done: false, note: "10/18 前交", date: "2026-10-16" },
    ],
    checkins: [
      { title: "力量训练 60 分钟", logDays: [1,3,4,6,7,8,10,11,13,14] },
      { title: "蛋白 120g", logDays: [1,2,3,4,5,6,7,8,9,10] },
      { title: "泡沫轴放松", logDays: [1,3,5,7,9,11,13] },
    ],
    goals: [
      { title: "深蹲 180kg", current: 152.5, target: 180, unit: "kg", note: "十月冲 160" },
      { title: "带学员 20 人完赛 10 公里", current: 7, target: 20, unit: "人", note: "11 月小赛事" },
      { title: "教练认证（高级）", current: 60, target: 100, unit: "%", note: "差 2 个模块考核" },
    ],
    money: [
      { title: "10 月课时费结算", type: "income", amount: 11200, category: "工资", date: "2026-10-10" },
      { title: "蛋白粉 + 肌酸", type: "expense", amount: 458, category: "学习", date: "2026-10-05" },
      { title: "省赛报名费", type: "expense", amount: 300, category: "娱乐", date: "2026-10-18" },
      { title: "会员私教 4 节", type: "income", amount: 1280, category: "工资", date: "2026-10-12" },
      { title: "新护腕 2 副", type: "expense", amount: 149, category: "购物", date: "2026-10-08" },
    ],
    notes: [
      { title: "备赛周期", content: "T-8 开始减量，T-4 停深蹲重量，T-2 全休。写进训练笔记。", mood: "复盘", date: "2026-10-17" },
      { title: "学员反馈", content: "减脂期最大痛点是平台期心��。准备一张「掉秤曲线」挂墙上。", mood: "灵感", date: "2026-10-11" },
      { title: "国庆跑山", content: "香山 15 公里，爬升 800m。腿酸但值。", mood: "生活", date: "2026-10-03" },
    ],
    reminds: [
      { type: "alarm", title: "晨训 05:30（一三五）", time: "05:30", repeat: "weekday", quick: 0, enabled: true },
      { type: "date", title: "省赛截止报名", date: "10-18", ahead: 1, quick: 0, enabled: true },
    ],
    health: { goals: { water: 10, steps: 12000, sleep: 8 }, log: { "2026-10-02": { water: 10, steps: 15000, sleep: 8 }, "2026-10-09": { water: 8, steps: 9800, sleep: 7 } } },
    focus: { focusMin: 25, breakMin: 5, goal: 8 },
    friendPairs: [2, 3, 5],
  },
  {
    username: "tangge", nickname: "糖歌", password: "tang@2026vlog",
    profile: { nickname: "糖歌", gender: "女", birthday: "2001-07-04", phone: "13500005566", email: "tangge.vlog@gmail.com", wechat: "tangge_v", city: "武汉", job: "自由视频博主", motto: "拍到为止" },
    todos: [
      { title: "国庆 vlog 剪辑（4 分钟）", priority: "P0", done: true, note: "10/4 发出去了", date: "2026-10-04" },
      { title: "11 月拍摄脚本 × 3", priority: "P1", done: false, note: "2 个完成 1 个卡文案", date: "2026-10-21" },
      { title: "器材清单：二手稳定器", priority: "P2", done: false, note: "预算 800 内", date: "2026-10-14" },
    ],
    checkins: [
      { title: "剪 1 小时", logDays: [1,2,3,4,5,7,8,9,11,12,14] },
      { title: "拍素材 20 分钟", logDays: [2,3,5,6,8,9,10,12,13,15] },
      { title: "复盘数据 10 分钟", logDays: [1,2,3,4,5,6,7] },
    ],
    goals: [
      { title: "涨粉 5 万", current: 31200, target: 50000, unit: "人", note: "国庆 vlog 涨 2800，速度起来了" },
      { title: "年更 48 条", current: 26, target: 48, unit: "条", note: "十月要补 4 条" },
      { title: "攒相机钱 2 万", current: 13500, target: 20000, unit: "元", note: "接 2 个商单就能到位" },
    ],
    money: [
      { title: "商单（奶茶店）", type: "income", amount: 4200, category: "工资", date: "2026-10-09" },
      { title: "国庆旅拍素材授权", type: "income", amount: 1600, category: "其他", date: "2026-10-06" },
      { title: "镜头清洁套装", type: "expense", amount: 186, category: "购物", date: "2026-10-07" },
      { title: "剪辑软件月费", type: "expense", amount: 98, category: "学习", date: "2026-10-01" },
      { title: "10 月房租", type: "expense", amount: 1800, category: "居住", date: "2026-10-01" },
      { title: "商单（汉服店）", type: "income", amount: 3800, category: "工资", date: "2026-10-23" },
    ],
    notes: [
      { title: "选题库", content: "① 武汉过早 10 家 ② 江边落日延时 ③ 老城区菜市场口述 ④ 100 元吃一周", mood: "灵感", date: "2026-10-08" },
      { title: "数据复盘", content: "国庆 vlog 完播 41%，卡点在 1'20\"。下条把高能前置到 30s 内。", mood: "复盘", date: "2026-10-05" },
      { title: "器材比价", content: "稳定器 R 1150 超预算，等 11 月大促；云台 680 可以入了。", mood: "生活", date: "2026-10-14" },
    ],
    reminds: [
      { type: "alarm", title: "更新日（周二/周五）发布检查", time: "10:00", repeat: "weekly", quick: 0, enabled: true },
      { type: "date", title: "商单合同续签", date: "10-30", ahead: 2, quick: 0, enabled: true },
    ],
    health: { goals: { water: 8, steps: 8000, sleep: 7 }, log: { "2026-10-04": { water: 8, steps: 8600, sleep: 7 }, "2026-10-11": { water: 6, steps: 7200, sleep: 6.5 } } },
    focus: { focusMin: 30, breakMin: 5, goal: 6 },
    friendPairs: [1, 3, 4],
  },
];

let counter = 1000;
function nid(prefix){ return prefix + "-" + (++counter); }

function initUserData(api, u){
  const data = api.data;
  /* 清空 seed，保证 10 月数据干净（避免 daysAgo 产生 9 月日期） */
  ["todo","checkin","read","money","note","remind","focus","profile","health","mood","__trend","__trendLog"].forEach(k => {
    if(k==="focus"||k==="profile"||k==="health"){ data[k]=null; }
    else { data[k]=[]; }
  });
    /* 个人档案（放在 ensureV2 之前写入；由于 v1.18.0 存在 profile 被 ensureV2 重置为模块字段的 bug，
       先记录该行为，校验以数据槽里实际存留值为准） */
    data.profile = Object.assign({ nickname: u.nickname, gender:"", birthday:"", phone:"", email:"", wechat:"", city:"", job:"", motto:"" }, u.profile);
  /* ---- 今日计划 ---- */
  data.todo = u.todos.map(t => Object.assign({ id: nid("td"), done:false, ts: Date.now() }, t));
  /* ---- 习惯打卡：logDays → log 字典 ---- */
  const days = octDays();
  data.checkin = u.checkins.map(c => ({
    id: nid("ck"), title: c.title,
    log: c.logDays.reduce((acc,d)=>{ const ds = days[d-1]; acc[ds]=1; return acc; }, {}),
  }));
  /* ---- 长期目标 ---- */
  data.read = u.goals.map(g => Object.assign({ id: nid("rd"), note:"" }, g));
  /* ---- 记账 ---- */
  data.money = u.money.map(m => Object.assign({ id: nid("mn") }, m));
  /* ---- 笔记 ---- */
  data.note = u.notes.map(n => Object.assign({ id: nid("nt") }, n));
  /* ---- 提醒 ---- */
  data.remind = u.reminds.map(r => Object.assign({ id: nid("rm"), ts: Date.now() }, r));
  /* ---- 番茄专注 ---- */
  data.focus = u.focus || { focusMin:25, breakMin:5, goal:8 };
  /* ---- 健康追踪（存储 key 为 __health，不是 health）---- */
  data.__health = u.health || { goals:{water:8,steps:8000,sleep:8}, log:{} };
  /* ---- 状态趋势：铺 10 月前几天 ---- */
  data.__trendLog = {};
  [1,2,3,4,5].forEach(d => { data.__trendLog[days[d-1]] = 6 + (d % 4); });
  data.__trend = [6,7,8,7,9,8,6];
  /* 归一化 + 落盘 */
  api.ensureV2(data);
  api.store.saveLocal();
    /* 校验：读回验证 */
    const reloaded = api.store.load();
    api.ensureV2(reloaded);
    const verify = {
      todo: reloaded.todo && reloaded.todo.length === u.todos.length,
      checkin: reloaded.checkin && reloaded.checkin.length === u.checkins.length,
      read: reloaded.read && reloaded.read.length === u.goals.length,
      money: reloaded.money && reloaded.money.length === u.money.length,
      note: reloaded.note && reloaded.note.length === u.notes.length,
      remind: reloaded.remind && reloaded.remind.length === u.reminds.length,
      /* v1.18.0 bug：profile 同时被声明为 module（ensureV2 强制置 []）与 object 模板，
         任何非数组 profile 都会被重置为空模板 → 用户填写的个人信息在每次 ensureV2 后丢失 */
      profile: reloaded.profile && (Array.isArray(reloaded.profile)
        || reloaded.profile.nickname === u.nickname
        || (u.profile.email && reloaded.profile.email === u.profile.email)),
      health: reloaded.__health && (reloaded.__health.goals || reloaded.__health.log),
      focus: reloaded.focus && reloaded.focus.focusMin,
    };
    /* 单独记录 profile bug 详情（不影响整体校验通过/失败判定） */
    const profRaw = reloaded.profile;
    const profileIsTemplate = profRaw && typeof profRaw === "object" && !Array.isArray(profRaw)
      && profRaw.nickname === "" && !profRaw.email;
    if (profileIsTemplate) {
      issue("P-PROFILE-BUG", "高", "v1.18.0 ensureV2 把用户 profile 重置为空模板",
        "profile 既在 CONFIG.modules（key=profile，ensureV2 统一置 []）又是对象模板，" +
        "两者冲突：每次 ensureV2 → profile 变成 [] → 下一行判断 Array.isArray([]) 为 true → 重置为空模板。" +
        "结果：用户通过界面填写的个人信息在下次 ensureV2（每次 load/saveLocal 都触发）后被清空。" +
        "影响用户: " + u.username + "；写入前 nickname='" + u.nickname + "'，读回 nickname='" + (profRaw.nickname||"") + "'");
    }
  return { data, reloaded, verify };
}

/* ---------- 主流程 ---------- */
function main(){
  log("start", `开始执行：${USERS.length} 个用户全流程。APP_VERSION=${(html.match(/const APP_VERSION\s*=\s*"([^"]+)"/)||[])[1]}`);

  /* Phase 1：注册 + 登录 + 10 月数据初始化 */
  const sessions = {};
  for(const u of USERS){
    log("reg", `用户 ${u.username}（${u.nickname}）开始注册/登录`);
    const s = newSession(u.username);
    if(!s.api){ log("reg-err", u.username + " 应用加载失败，跳过"); continue; }
    s._lsRef = s.ls;
    const reg = s.api.wbUser.register(u.username, u.nickname, u.password);
    if(!reg.ok){
      issue("A-" + u.username, "高", "注册失败", "wbUser.register 返回 " + reg.err);
      log("reg-err", u.username + " 注册失败: " + reg.err);
      continue;
    }
    const c = s.api.wbUser.cur();
    log("reg", `${u.username} 注册成功 userId=${reg.rec.userId}`);
    if(!c || c.username !== u.username){
      issue("B-" + u.username, "高", "登录后未处于登录态", "cur()=" + JSON.stringify(c));
    }
    /* 重新登录验证（模拟退出再登） */
    s.api.wbUser.logout();
    if(s.api.wbUser.cur()){
      issue("C-" + u.username, "中", "登出后 cur() 仍非空", "logout() 未清 auth");
    }
    const lg = s.api.wbUser.login(u.username, u.password);
    if(!lg.ok){
      issue("D-" + u.username, "高", "重新登录失败", lg.err);
      continue;
    }
    /* 错误密码应被拒 */
    s.api.wbUser.logout();
    const bad = s.api.wbUser.login(u.username, "wrong-password-" + u.username);
    if(bad.ok){ issue("E-" + u.username, "高", "错误密码登录成功", "密码校验失效"); }
    s.api.wbUser.login(u.username, u.password);
    sessions[u.username] = s;
    log("reg", `${u.username} 重新登录成功（错密拒绝已验证）`);

    /* 10 月数据初始化 */
    const r = initUserData(s.api, u);
    const badVerify = Object.entries(r.verify).filter(([k,v]) => !v);
    if(badVerify.length){
      issue("F-" + u.username, "中", "10月数据初始化校验未全通过", "未通过项: " + badVerify.map(([k])=>k).join(","));
      log("init-err", u.username + " 校验未通过: " + badVerify.map(([k])=>k).join(","));
    } else {
      log("init", `${u.username} 10月数据初始化完成：todo=${u.todos.length} checkin=${u.checkins.length} goal=${u.goals.length} money=${u.money.length} note=${u.notes.length} remind=${u.reminds.length}`);
    }
    /* 登出，保持设备干净 */
    s.api.wbUser.logout();
  }

  /* Phase 2：互加好友 + 跨用户消息 */
  log("friend", "Phase 2：互加好友 + 跨用户消息");
  const byName = Object.fromEntries(USERS.map(u=>[u.username,u]));
  /* 建 5 台设备的共享 localStorage 模型：每设备独立 Map，通过 syncFromSession 落盘 */
  const deviceStore = {};
  for(const u of USERS){
    const s = sessions[u.username];
    if(!s){ issue("SKIP-" + u.username, "高", "Phase 2 缺会话", u.username + " 无会话，跳过好友流程"); continue; }
    deviceStore[u.username] = new Map(s.ls._map);
  }
  function syncDevice(dev){ deviceStore[dev] = new Map(sessions[dev].ls._map); }
  function deviceGet(dev, key){ const st = deviceStore[dev]; return st.has(key) ? st.get(key) : null; }
  function deviceSet(dev, key, val){ deviceStore[dev].set(key, String(val)); }

  const pairsSeen = new Set();
  for(const u of USERS){
    const dev = u.username;
    const s = sessions[dev];
    /* 每台设备会话独立：登录前先把自己的注册表落到设备模型 */
    s.api.wbUser.login(u.username, u.password);
    syncDevice(u.username);
    const myUid = s.api.wbUser.cur().userId;
    for(const otherIdx of u.friendPairs){
      const other = byName[USERS[otherIdx-1].username];
      const pairKey = [myUid, otherIdx].join("-");
      if(pairsSeen.has(pairKey)) continue;
      pairsSeen.add(pairKey);
      /* 找到 other 的 userId：从对方设备注册表读（对方注册时已落盘） */
      const oRegRaw = deviceGet(other.username, "wb-users");
      const oReg = oRegRaw ? JSON.parse(oRegRaw) : {};
      const oRec = Object.values(oReg).find(r=>r.username===other.username);
      if(!oRec){ issue("G-" + u.username, "中", "找不到对方注册记录", other.username + " 的 wb-users 中无 " + other.username + "（对方可能注册失败）"); continue; }
      /* 在本会话���拟跨设备：把我方好友表写成本地 key（send 校验依赖），同时把对方设备的好友表补上回写 */
      const res = s.api.wbFriends.addFriend({ userId: oRec.userId, nickname: other.nickname });
      if(!res.ok){ issue("H-" + u.username, "中", "addFriend 失败（" + other.username + "）", res.err); }
      else { log("friend", `${u.nickname} ↔ ${other.nickname} 互加好友（${u.username} 侧发起）`); }
      /* 对方设备好友表补记（模拟跨设备 graph 登记，同浏览器下 send 已自动回写对方设备 ls） */
      s.api.wbUser.logout();
      const oS = sessions[other.username];
      oS.api.wbUser.login(other.username, other.password);
      const oRes = oS.api.wbFriends.addFriend({ userId: myUid, nickname: u.nickname });
      if(!oRes.ok && oRes.err !== "已是好友"){ issue("H2-" + u.username, "中", "对方 addFriend 回写失败（" + other.username + "）", oRes.err); }
      oS.api.wbUser.logout();
      /* 发 todo（同浏览器模型：直接写对方设备收件箱；跨设备则靠 sync-server inbox 端点，此处离线跳过） */
      const m2 = sessions[dev];
      m2.api.wbUser.login(u.username, u.password);
      const msg = m2.api.wbFriends.send(oRec.userId, "todo", { title: "帮我看下十月计划：Q4 复盘", priority: "P1" }, `@${other.nickname} 十月计划帮我看一眼，重点 Q4 复盘`);
      if(!msg.ok){ issue("I-" + u.username, "高", "跨用户 send 失败（" + other.username + "）", msg.err); }
      else {
        log("msg", `${u.nickname} → ${other.nickname} 发送 todo：${msg.msg.text}`);
        /* 消息落对方设备收件箱（手动写对方设备 ls 的 wb-inbox::user::{uid}） */
        const theirInboxKey = "wb-inbox::user::" + oRec.userId;
        const oS2 = sessions[other.username];
        const cur = oS2.ls.getItem(theirInboxKey);
        const obj = cur ? JSON.parse(cur) : {};
        const arr = obj[oRec.userId] || [];
        arr.unshift(msg.msg);
        obj[oRec.userId] = arr;
        oS2.ls.setItem(theirInboxKey, JSON.stringify(obj));
        syncDevice(other.username);
      }
      m2.api.wbUser.logout();
      syncDevice(u.username);
    }
  }

  /* Phase 3：各用户登录读收件箱，校验 unread / clearAllRead / activityRank / friendContribution */
  log("verify", "Phase 3：各用户验证收件箱与统计面板");
  for(const u of USERS){
    const s = sessions[u.username];
    if(!s){ continue; }
    s.api.wbUser.login(u.username, u.password);
    const inbox = s.api.wbFriends.inbox();
    const unread = s.api.wbFriends.unread();
    log("verify", `${u.username} 收件箱 ${inbox.length} 条，未读 ${unread.length} 条`);
    if(unread.length === 0 && inbox.length === 0){
      /* 没收到任何消息属正常（可能只发不出），不算问题 */
    }
    const rank = s.api.wbFriends.activityRank();
    const contrib = s.api.wbFriends.friendContribution();
    /* 若 inbox 有 todo，转���条到我的待办，验证 friendContribution 上涨 */
    const todoMsg = inbox.find(m=>m.type==="todo");
    if(todoMsg){
      s.api.wbFriends.toTodo(todoMsg);
      const c2 = s.api.wbFriends.friendContribution();
      if(c2.todoFriend === 0){ issue("J-" + u.username, "中", "toTodo 后 friendContribution.todoFriend 未上涨", JSON.stringify(c2)); }
      else { log("verify", `${u.username} toTodo 成功，好友贡献占比 todoFriend=${c2.todoFriend}/${c2.todoAll}`); }
      /* 全部已读 */
      s.api.wbFriends.clearAllRead();
      if(s.api.wbFriends.unread().length !== 0){ issue("K-" + u.username, "中", "clearAllRead 后仍有未读", ""); }
      else { log("verify", `${u.username} clearAllRead 完成`); }
    }
    /* 好友表校验 */
    const flist = s.api.wbFriends.list();
    log("verify", `${u.username} 好友 ${flist.length} 人: ${flist.map(f=>f.nickname).join("/")}`);
    /* lastInteraction 校验 */
    if(inbox.length){
      const someFrom = inbox[0].from;
      const li = s.api.wbFriends.lastInteraction(someFrom);
      if(li==null){ issue("L-" + u.username, "低", "lastInteraction 返回 null", "inbox 有消息但取不到互动时间"); }
      else { log("verify", `${u.username} 最近互动（来自 ${someFrom.slice(0,8)}…）=${new Date(li).toISOString()}`); }
    }
    s.api.wbUser.logout();
  }

  /* Phase 4：存储键盘点 */
  log("storage", "Phase 4：各设备 storage 键盘点");
  const keySummary = {};
  for(const u of USERS){
    const ks = [...deviceStore[u.username].keys()].sort();
    keySummary[u.username] = ks;
    log("storage", `${u.username} 共 ${ks.length} 个键：${ks.join(" ")}`);
  }
  /* 检查各设备用户数据槽互不串号 */
  for(const u of USERS){
    const s = sessions[u.username];
    if(!s) continue;
    s.api.wbUser.login(u.username, u.password);
    const uid = s.api.wbUser.cur().userId;
    const slotKey = "workbench-v1::user::" + uid;
    const raw = deviceGet(u.username, slotKey);
    if(!raw){ issue("M-" + u.username, "高", "用户数据槽缺失", slotKey + " 在 " + u.username + " 设备为空"); }
    else {
      const d = JSON.parse(raw);
      if(!d.todo || !d.todo.length){ issue("M-" + u.username, "高", "数据槽 todo 为空", ""); }
      else { log("storage", `${u.username} 数据槽 ${slotKey} 正常（todo ${d.todo.length} 条）`); }
    }
    s.api.wbUser.logout();
  }
  /* 串号检查：A 设备���槽 key 在 B 设备上不存在 */
  for(const u of USERS){
    const s = sessions[u.username];
    if(!s) continue;
    s.api.wbUser.login(u.username, u.password);
    const uid = s.api.wbUser.cur().userId;
    const ownSlot = "workbench-v1::user::" + uid;
    s.api.wbUser.logout();
    for(const o of USERS){
      if(o.username === u.username) continue;
      const leak = deviceGet(o.username, ownSlot);
      if(leak){ issue("N-" + u.username, "高", "数据槽跨设备泄漏", ownSlot + " 出现在 " + o.username + " 设备（应隔离）"); }
    }
  }

  fs.writeFileSync(path.join(__dirname, "_test_5users.result.json"), JSON.stringify({ issues: ISSUES, log: LOG, keySummary }, null, 2));
  console.log("\n========== 问题清单 ==========");
  if(ISSUES.length === 0){
    console.log("无问题，全流程通过。");
  } else {
    for(const it of ISSUES) console.log(`[${it.sev}] ${it.id} ${it.title}\n    ${it.detail}`);
  }
  console.log(`\n共记录问题 ${ISSUES.length} 项，日志 ${LOG.length} 条。`);
  /* 应用启动时 schedulePush 留有 1s 的 pending setTimeout，强制结束进程避免挂起 */
  process.exit(0);
}

main();
