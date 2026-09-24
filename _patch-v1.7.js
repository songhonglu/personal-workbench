#!/usr/bin/env node
/* ============================================================
   _patch-v1.7.js — 批3: 主题合并(8→2 运行时切肤) + 新手引导
   规则:
     S1  切肤 CSS 注入(从 mint/mocha/rose 提取亮色 token + 配色规则)
     S2  🎨/❓ 按钮注入(topbar, wb-theme 前)
     S3  引导弹窗 HTML + 切肤/引导 JS(</body> 前)
     S4  EMPTY_HINTS 常量(persist 前)
     S5  桌面空状态模块化(×2, replaceAll)
     S6  移动空状态模块化(×1)
     S7  同步钩子捕获 __skin(oldSkin)
     S8  同步钩子拉取后应用 skin
   用法: node _patch-v1.7.js [--check]
   ============================================================ */
const fs = require("fs");
const D = __dirname + "/";
const CHECK = process.argv.includes("--check");
const failures = [];

function apply(file, from, to, expect, mark) {
  const p = D + file;
  const s = fs.readFileSync(p, "utf8");
  if (mark && s.includes(mark)) { console.log("↷ 跳过(已应用) " + file + " :: " + mark); return; }
  const n = s.split(from).length - 1;
  if (n !== expect) {
    console.log("✗ MISS " + file + " :: 期望" + expect + " 实际" + n + " :: " + from.slice(0, 60).replace(/\n/g, "⏎"));
    failures.push(file + " :: " + from.slice(0, 50));
    return;
  }
  if (!CHECK) { fs.writeFileSync(p, s.split(from).join(to)); console.log("✓ " + file + " :: " + n + " 处替换"); }
  else console.log("✓(干跑) " + file + " :: " + n + " 处命中");
}

/* ---------- 皮肤 token 提取 ---------- */
function extractSkin(srcFile, skinId) {
  const s = fs.readFileSync(D + srcFile, "utf8");
  const r0 = s.indexOf("  :root {");
  if (r0 < 0) throw new Error(srcFile + ": 找不到 :root 块");
  const rEnd = s.indexOf("\n  }", r0);
  if (rEnd < 0) throw new Error(srcFile + ": :root 块未闭合");
  let rootBlock = s.slice(r0, rEnd + 4);
  const am = rootBlock.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
  const accent = am ? am[1] : "#888888";
  rootBlock = rootBlock.replace(":root {", ':root[data-skin="' + skinId + '"]{');
  const c0 = s.indexOf("  /* ---- gradient progress bars ---- */");
  const c1 = s.indexOf("  /* ---- reduced motion ---- */");
  if (c0 < 0 || c1 < 0 || c1 <= c0) throw new Error(srcFile + ": 配色区块定位失败");
  let rules = s.slice(c0, c1);
  rules = rules.replace(/^  (\.[a-zA-Z0-9_-]+[^{\n]*\{)/gm, '  [data-skin="' + skinId + '"] $1');
  rules.split("\n").forEach(function (l) {
    if (l && !l.startsWith("  /*") && !l.startsWith("  [data-skin=") && l.trim() !== "")
      throw new Error(srcFile + ": 未前缀行 → " + l.slice(0, 60));
  });
  return { rootBlock: rootBlock, rules: rules, accent: accent };
}

const mintD  = extractSkin("workbench-mint.html",  "mint");
const mochaD = extractSkin("workbench-mocha.html", "mocha");
const roseD  = extractSkin("workbench-rose.html",  "rose");
const mintM  = extractSkin("workbench-mint-m.html",  "mint");
const mochaM = extractSkin("workbench-mocha-m.html", "mocha");
const roseM  = extractSkin("workbench-rose-m.html",  "rose");
const amberAcc = (fs.readFileSync(D + "workbench.html", "utf8").match(/--accent:\s*(#[0-9a-fA-F]{3,8})/) || [])[1] || "#c98a2b";
console.log("提取完成 accents → amber:" + amberAcc + " mint:" + mintD.accent + " mocha:" + mochaD.accent + " rose:" + roseD.accent);

/* ---------- 注入内容 ---------- */
const SKIN_CSS = [
"  /* ---- skin switcher (v1.7) ---- */",
"  .skin-wrap{position:relative;display:inline-flex}",
'  .skin-pop{position:absolute;top:calc(100% + 10px);right:-6px;background:var(--surface-card);border:1px solid var(--border);border-radius:14px;padding:10px;display:none;flex-direction:column;gap:2px;box-shadow:var(--shadow-overlay);z-index:80;min-width:132px}',
"  .skin-pop.show{display:flex}",
'  .skin-dot{display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;font:inherit;font-size:13px;color:var(--text-secondary);padding:7px 9px;border-radius:9px;text-align:left}',
"  .skin-dot:hover{background:var(--surface-nested)}",
'  .skin-dot i{width:16px;height:16px;border-radius:50%;display:inline-block;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}',
"  .skin-dot.on{color:var(--text);font-weight:600}",
"  .skin-dot.on i{outline:2px solid var(--accent);outline-offset:2px}",
"  /* ---- onboarding guide (v1.7) ---- */",
"  .ob{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:120;padding:20px}",
"  .ob.show{display:flex}",
'  .ob-card{background:var(--surface-card);border:1px solid var(--border);border-radius:20px;max-width:440px;width:100%;max-height:86vh;overflow:auto;padding:26px 24px;box-shadow:var(--shadow-overlay)}',
"  .ob-t{font-size:19px;font-weight:700;color:var(--text);margin-bottom:16px}",
'  .ob-item{display:flex;gap:11px;margin-bottom:12px;font-size:13.5px;line-height:1.55;color:var(--text-secondary)}',
"  .ob-item b{color:var(--text);font-weight:600}",
"  .ob-ic{flex:0 0 auto;font-size:17px;line-height:1.45}",
'  .ob-btn{width:100%;margin-top:12px;padding:11px;border:none;border-radius:12px;background:var(--accent);color:var(--on-accent,#fff);font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}',
"  .ob-btn:hover{filter:brightness(1.06)}",
"  @media (max-width:520px){.ob-card{padding:22px 18px;border-radius:16px}}",
""].join("\n");

function obHTML(nav, add, backup) {
  return [
'<div class="ob" id="ob">',
'  <div class="ob-card">',
'    <div class="ob-t">👋 欢迎使用我的工作台</div>',
'    <div class="ob-item"><span class="ob-ic">🧭</span><div><b>切换模块</b>：' + nav + '</div></div>',
'    <div class="ob-item"><span class="ob-ic">➕</span><div><b>添加记录</b>：' + add + '</div></div>',
'    <div class="ob-item"><span class="ob-ic">✅</span><div><b>积累趋势</b>：完成待办、习惯打卡、写笔记都会累计成首页趋势分</div></div>',
'    <div class="ob-item"><span class="ob-ic">⭐</span><div><b>今日要事</b>：点记录上的星标，把重要的事置顶到首页</div></div>',
'    <div class="ob-item"><span class="ob-ic">🎨</span><div><b>外观</b>：右上角 🎨 换配色（琥珀/薄荷/摩卡/玫瑰），🌙 切深色模式</div></div>',
'    <div class="ob-item"><span class="ob-ic">🔒</span><div><b>数据安全</b>：数据存本机，' + backup + '；设置里可开多端同步；删除的记录可在回收站恢复</div></div>',
'    <button class="ob-btn" id="ob-btn">开始使用</button>',
'  </div>',
'</div>'].join("\n");
}

function skinJS(aAmber, aMint, aMocha, aRose) {
  return [
'<script>',
'(function(){',
'  var SKINS=[',
'    {id:"amber",emoji:"🌻",name:"Amber",c:"' + aAmber + '"},',
'    {id:"mint",emoji:"🌿",name:"Mint",c:"' + aMint + '"},',
'    {id:"mocha",emoji:"☕",name:"Mocha",c:"' + aMocha + '"},',
'    {id:"rose",emoji:"🌹",name:"Rose",c:"' + aRose + '"}',
'  ];',
'  function applySkin(id){',
'    var d=document.documentElement;',
'    if(id&&id!=="amber")d.setAttribute("data-skin",id);else d.removeAttribute("data-skin");',
'    var s=SKINS.filter(function(x){return x.id===(id||"amber");})[0]||SKINS[0];',
'    document.title=s.emoji+" 我的工作台 · "+s.name;',
'    var dots=document.querySelectorAll(".skin-dot");',
'    for(var i=0;i<dots.length;i++){dots[i].classList.toggle("on",dots[i].getAttribute("data-skin")===s.id);}',
'  }',
'  window.applySkin=applySkin;',
'  function buildPop(){',
'    var pop=document.getElementById("skin-pop");if(!pop)return;',
'    pop.innerHTML=SKINS.map(function(s){return \'<button class="skin-dot" data-skin="\'+s.id+\'"><i style="background:\'+s.c+\'"></i><span>\'+s.emoji+\' \'+s.name+\'</span></button>\';}).join("");',
'  }',
'  function initSkin(){',
'    try{applySkin((typeof data!=="undefined"&&data.__skin)||"amber");}catch(e){}',
'    var btn=document.getElementById("wb-skin"),pop=document.getElementById("skin-pop");',
'    if(btn&&pop)btn.onclick=function(){pop.classList.toggle("show");};',
'    document.addEventListener("click",function(e){',
'      if(!pop||!pop.classList.contains("show"))return;',
'      if(e.target===btn||(pop.contains&&pop.contains(e.target)))return;',
'      pop.classList.remove("show");',
'    });',
'    if(pop)pop.addEventListener("click",function(e){',
'      var b=e.target.closest?e.target.closest(".skin-dot"):null;if(!b)return;',
'      var id=b.getAttribute("data-skin");',
'      try{data.__skin=id;store.save();}catch(err){}',
'      applySkin(id);pop.classList.remove("show");',
'      try{toast("已切换主题："+id);}catch(err){}',
'    });',
'  }',
'  function showGuide(){var o=document.getElementById("ob");if(o)o.classList.add("show");}',
'  function hideGuide(save){',
'    var o=document.getElementById("ob");if(o)o.classList.remove("show");',
'    if(save){try{data.__onboarded=true;store.save();}catch(e){}}',
'  }',
'  function init(){',
'    buildPop();initSkin();',
'    var h=document.getElementById("wb-help");if(h)h.onclick=showGuide;',
'    var b=document.getElementById("ob-btn");if(b)b.onclick=function(){hideGuide(true);};',
'    var o=document.getElementById("ob");',
'    if(o)o.addEventListener("click",function(e){if(e.target===o)hideGuide(true);});',
'    var first=false;try{first=!data.__onboarded;}catch(e){}',
'    if(first)setTimeout(showGuide,900);',
'  }',
'  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();',
'})();',
'<\/script>'].join("\n");
}

/* ---------- EMPTY_HINTS ---------- */
const EMPTY_HINTS =
'const EMPTY_HINTS={todo:"先把今天要做的 2-3 件事写下来，完成一条勾一条",checkin:"创建一个想坚持的小习惯，每天来打一次卡",read:"选一本书或一门课，从第一页开始推进",money:"记下第一笔收支，坚持一周就能看到趋势",note:"随手写下第一条想法、灵感或摘录"};';

/* ---------- S1: 切肤 CSS 注入 ---------- */
function skinCssTO(blocks) {
  // blocks: [{rootBlock, rules}...] 已按 skin 顺序
  let out = SKIN_CSS + "\n";
  blocks.forEach(function (b) { out += b.rootBlock + "\n"; });
  blocks.forEach(function (b) { out += b.rules; });
  return out + "  /* ---- gradient progress bars ---- */";
}
const SKIN_FROM = "  /* ---- gradient progress bars ---- */";

/* ---------- 桌面 workbench.html ---------- */
const W_SKIN_MARK = ':root[data-skin="mint"]{';
apply("workbench.html", SKIN_FROM, skinCssTO([mintD, mochaD, roseD]), 1, W_SKIN_MARK);

apply("workbench.html",
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  '<button class="wb-theme-btn" id="wb-help" title="使用指南">❓</button>' +
  '<span class="skin-wrap"><button class="wb-theme-btn" id="wb-skin" title="切换主题配色">🎨</button>' +
  '<div class="skin-pop" id="skin-pop"></div></span>' +
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  1, 'id="wb-skin"');

apply("workbench.html", "</body>",
  obHTML("左侧栏点击切换，数字键 1-5 秒切", "点右上角「新建」", "左下角「导出备份」定期备份")
  + "\n" + skinJS(amberAcc, mintD.accent, mochaD.accent, roseD.accent) + "\n</body>",
  1, 'id="ob"');

apply("workbench.html",
  "function persist(){ store.save(); render(); }",
  EMPTY_HINTS + "\nfunction persist(){ store.save(); render(); }",
  1, "const EMPTY_HINTS={");

apply("workbench.html",
  '    : `<div class="empty"><span class="e">${icon(m.icon,28)}</span><div>${q?\'没有匹配的记录\':\'还没有记录，点右上角「新建」添加第一条吧\'}</div></div>`;',
  '    : `<div class="empty"><span class="e">${icon(m.icon,28)}</span><div>${q?\'没有匹配的记录\':\'还没有\'+m.name+\'记录\'}</div>${q?\'\':\'<div style="font-size:12.5px;color:var(--text-tertiary);margin-top:6px">\'+(EMPTY_HINTS[m.key]||\'点右上角「新建」添加第一条吧\')+\'</div>\'}</div>`;',
  2, "EMPTY_HINTS[m.key]");

/* ---------- 移动 workbench-m.html ---------- */
apply("workbench-m.html", SKIN_FROM, skinCssTO([mintM, mochaM, roseM]), 1, W_SKIN_MARK);

apply("workbench-m.html",
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  '<button class="wb-theme-btn" id="wb-help" title="使用指南">❓</button>' +
  '<span class="skin-wrap"><button class="wb-theme-btn" id="wb-skin" title="切换主题配色">🎨</button>' +
  '<div class="skin-pop" id="skin-pop"></div></span>' +
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  1, 'id="wb-skin"');

apply("workbench-m.html", "</body>",
  obHTML("底部 Tab 切换，右上 ☰ 打开抽屉", "点模块页顶部「新建」", "抽屉里「导出备份」定期备份")
  + "\n" + skinJS(amberAcc, mintM.accent, mochaM.accent, roseM.accent) + "\n</body>",
  1, 'id="ob"');

apply("workbench-m.html",
  "function persist(){ store.save(); render(); }",
  EMPTY_HINTS + "\nfunction persist(){ store.save(); render(); }",
  1, "const EMPTY_HINTS={");

apply("workbench-m.html",
  '    : `<div class="empty"><span class="e">${icon(m.icon,26)}</span><div>还没有记录，点上方「新建」添加第一条吧</div></div>`;',
  '    : `<div class="empty"><span class="e">${icon(m.icon,26)}</span><div>还没有${m.name}记录</div><div style="font-size:12.5px;color:var(--text-tertiary);margin-top:6px">${EMPTY_HINTS[m.key]||\'点上方「新建」添加第一条吧\'}</div></div>`;',
  1, "还没有${m.name}记录");

/* ---------- S7/S8: 同步钩子(双端同锚点) ---------- */
["workbench.html", "workbench-m.html"].forEach(function (f) {
  apply(f,
    "      const oldWeather = data.__weather;",
    "      const oldWeather = data.__weather;\n      const oldSkin = data.__skin;",
    1, "const oldSkin = data.__skin;");

  apply(f,
    'ci.textContent=data.__weather.city||"点击设置";}\n      }\n    };',
    'ci.textContent=data.__weather.city||"点击设置";}\n      }\n' +
    '      if ((data.__skin||"amber") !== (oldSkin||"amber")) { try{ window.applySkin && window.applySkin(data.__skin||"amber"); }catch(e){} }\n    };',
    1, "window.applySkin && window.applySkin");
});

/* ---------- 汇总 ---------- */
console.log("");
if (failures.length) {
  console.log("✗ 失败 " + failures.length + " 处：");
  failures.forEach(function (x) { console.log("   - " + x); });
  process.exit(1);
}
console.log(CHECK ? "—— 干跑完成 ——" : "—— v1.7 补丁完成 ——");

/* ---------- EMPTY_HINTS ---------- */
const EMPTY_HINTS =
'const EMPTY_HINTS={todo:"先把今天要做的 2-3 件事写下来，完成一条勾一条",checkin:"创建一个想坚持的小习惯，每天来打一次卡",read:"选一本书或一门课，从第一页开始推进",money:"记下第一笔收支，坚持一周就能看到趋势",note:"随手写下第一条想法、灵感或摘录"};';

/* ---------- S1: 切肤 CSS 注入 ---------- */
function skinCssTO(blocks) {
  // blocks: [{rootBlock, rules}...] 已按 skin 顺序
  let out = SKIN_CSS + "\n";
  blocks.forEach(function (b) { out += b.rootBlock + "\n"; });
  blocks.forEach(function (b) { out += b.rules; });
  return out + "  /* ---- gradient progress bars ---- */";
}
const SKIN_FROM = "  /* ---- gradient progress bars ---- */";

/* ---------- 桌面 workbench.html ---------- */
const W_SKIN_MARK = ':root[data-skin="mint"]{';
apply("workbench.html", SKIN_FROM, skinCssTO([mintD, mochaD, roseD]), 1, W_SKIN_MARK);

apply("workbench.html",
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  '<button class="wb-theme-btn" id="wb-help" title="使用指南">❓</button>' +
  '<span class="skin-wrap"><button class="wb-theme-btn" id="wb-skin" title="切换主题配色">🎨</button>' +
  '<div class="skin-pop" id="skin-pop"></div></span>' +
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  1, 'id="wb-skin"');

apply("workbench.html", "</body>",
  obHTML("左侧栏点击切换，数字键 1-5 秒切", "点右上角「新建」", "左下角「导出备份」定期备份")
  + "\n" + skinJS(amberAcc, mintD.accent, mochaD.accent, roseD.accent) + "\n</body>",
  1, 'id="ob"');

apply("workbench.html",
  "function persist(){ store.save(); render(); }",
  EMPTY_HINTS + "\nfunction persist(){ store.save(); render(); }",
  1, "const EMPTY_HINTS={");

apply("workbench.html",
  '    : `<div class="empty"><span class="e">${icon(m.icon,28)}</span><div>${q?\'没有匹配的记录\':\'还没有记录，点右上角「新建」添加第一条吧\'}</div></div>`;',
  '    : `<div class="empty"><span class="e">${icon(m.icon,28)}</span><div>${q?\'没有匹配的记录\':\'还没有\'+m.name+\'记录\'}</div>${q?\'\':\'<div style="font-size:12.5px;color:var(--text-tertiary);margin-top:6px">\'+(EMPTY_HINTS[m.key]||\'点右上角「新建」添加第一条吧\')+\'</div>\'}</div>`;',
  2, "EMPTY_HINTS[m.key]");

/* ---------- 移动 workbench-m.html ---------- */
apply("workbench-m.html", SKIN_FROM, skinCssTO([mintM, mochaM, roseM]), 1, W_SKIN_MARK);

apply("workbench-m.html",
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  '<button class="wb-theme-btn" id="wb-help" title="使用指南">❓</button>' +
  '<span class="skin-wrap"><button class="wb-theme-btn" id="wb-skin" title="切换主题配色">🎨</button>' +
  '<div class="skin-pop" id="skin-pop"></div></span>' +
  '<button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>',
  1, 'id="wb-skin"');

apply("workbench-m.html", "</body>",
  obHTML("底部 Tab 切换，右上 ☰ 打开抽屉", "点模块页顶部「新建」", "抽屉里「导出备份」定期备份")
  + "\n" + skinJS(amberAcc, mintM.accent, mochaM.accent, roseM.accent) + "\n</body>",
  1, 'id="ob"');

apply("workbench-m.html",
  "function persist(){ store.save(); render(); }",
  EMPTY_HINTS + "\nfunction persist(){ store.save(); render(); }",
  1, "const EMPTY_HINTS={");

apply("workbench-m.html",
  '    : `<div class="empty"><span class="e">${icon(m.icon,26)}</span><div>还没有记录，点上方「新建」添加第一条吧</div></div>`;',
  '    : `<div class="empty"><span class="e">${icon(m.icon,26)}</span><div>还没有${m.name}记录</div><div style="font-size:12.5px;color:var(--text-tertiary);margin-top:6px">${EMPTY_HINTS[m.key]||\'点上方「新建」添加第一条吧\'}</div></div>`;',
  1, "还没有${m.name}记录");

/* ---------- S7/S8: 同步钩子(双端同锚点) ---------- */
["workbench.html", "workbench-m.html"].forEach(function (f) {
  apply(f,
    "      const oldWeather = data.__weather;",
    "      const oldWeather = data.__weather;\n      const oldSkin = data.__skin;",
    1, "const oldSkin = data.__skin;");

  apply(f,
    'ci.textContent=data.__weather.city||"点击设置";}\n      }\n    };',
    'ci.textContent=data.__weather.city||"点击设置";}\n      }\n' +
    '      if ((data.__skin||"amber") !== (oldSkin||"amber")) { try{ window.applySkin && window.applySkin(data.__skin||"amber"); }catch(e){} }\n    };',
    1, "window.applySkin && window.applySkin");
});

/* ---------- 汇总 ---------- */
console.log("");
if (failures.length) {
  console.log("✗ 失败 " + failures.length + " 处：");
  failures.forEach(function (x) { console.log("   - " + x); });
  process.exit(1);
}
console.log(CHECK ? "—— 干跑完成 ——" : "—— v1.7 补丁完成 ——");
