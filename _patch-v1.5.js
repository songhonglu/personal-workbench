#!/usr/bin/env node
/* v1.5 补丁：数据安全 + 体验批次
 * 1. 编辑器未保存提示（关闭前拦截）        — PM#1 王芳
 * 2. 回收站：删除→软删除 30 天，可恢复     — PM#4 王芳/陈晓婷
 * 3. 导入前自动导出当前数据为备份          — PM#2 王芳
 * 4. 每周导出提醒（>7 天未导出）           — PM#7 王芳/李志强
 * 5. feature 大图布局使用全尺寸图片        — PM#5 赵鹏
 * 6. SW 首访预热当前页面 + 缓存版本升级    — PM#12 赵鹏
 * 用法: node _patch-v1.5.js
 * 锚点替换用 split/join（字面量，无 $ 模式陷阱；单次替换防死循环） */
const fs = require('fs');

const DESKTOP = ['workbench-amber.html','workbench-mint.html','workbench-mocha.html','workbench-rose.html'];
const MOBILE  = ['workbench-amber-m.html','workbench-mint-m.html','workbench-mocha-m.html','workbench-rose-m.html'];
const WB      = DESKTOP.concat(MOBILE);
const SWFILES = WB.concat(['index.html']);

let misses = 0, warns = 0;

function apply(file, from, to, label, expect) {
  let s;
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { console.log('✗ [' + file + '] ' + label + ' — 读文件失败'); misses++; return; }
  const n = s.split(from).length - 1;
  if (n === 0) { console.log('✗ [' + file + '] ' + label + ' — 锚点未命中'); misses++; return; }
  if (expect && n !== expect) { console.log('⚠ [' + file + '] ' + label + ' — 命中 ' + n + '（预期 ' + expect + '）'); warns++; }
  fs.writeFileSync(file, s.split(from).join(to));
  console.log('✓ [' + file + '] ' + label + ' ×' + n);
}

/* ---------- R1 SW 注册升级：等 ready 后把当前页面 URL 发给 SW 预热 ---------- */
const R1_FROM = "navigator.serviceWorker.register('sw.js').catch(function(){})";
const R1_TO   = "navigator.serviceWorker.register('sw.js').then(function(){ return navigator.serviceWorker.ready; }).then(function(reg){ try{ reg.active && reg.active.postMessage({precache: location.pathname}); }catch(e){} }).catch(function(){})";

/* ---------- R2 编辑器未保存提示（脏标记 + 关闭拦截） ---------- */
const R2_FROM = "  overlay.onclick=e=>{ if(e.target===overlay) close(); };\n  overlay.querySelector(\"#m-cancel\").onclick=close;";
const R2_TO = [
"  var _edDirty=false;",
"  overlay.addEventListener('input',function(){_edDirty=true;});",
"  overlay.addEventListener('change',function(){_edDirty=true;});",
"  overlay.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('.opt')) _edDirty=true; });",
"  var _tryClose=function(){ if(_edDirty && !confirm(\"有未保存的修改，确定丢弃？\")) return; close(); };",
"  overlay.onclick=e=>{ if(e.target===overlay) _tryClose(); };",
"  overlay.querySelector(\"#m-cancel\").onclick=_tryClose;"
].join('\n');

/* ---------- R3 删除改为软删除：进回收站 __trash，30 天有效 ---------- */
const R3_FROM = "list.splice(idx,1); persist();   // 直接删除，toast 内 5 秒可撤销";
const R3_TO   = "list.splice(idx,1); data.__trash=(data.__trash||[]); data.__trash.unshift(Object.assign({},item,{__module:key,__deletedAt:isoToday()})); if(data.__trash.length>200)data.__trash.length=200; persist();   // v1.5 软删除进回收站，30 天内可恢复";

/* ---------- R4 撤销删除：同时从回收站移除 ---------- */
const R4_FROM = "if(!data[key].some(i=>i.id==id)){ data[key].splice(Math.min(idx,data[key].length),0,item); persist(); }";
const R4_TO   = "if(!data[key].some(i=>i.id==id)){ data[key].splice(Math.min(idx,data[key].length),0,item); } data.__trash=(data.__trash||[]).filter(t=>!(t.id==id&&t.__module==key)); persist();";

/* ---------- R5 回收站视图函数（两端共用 #screen 容器） ---------- */
const R5_FROM = "function confirmDelete(key,id){";
const R5_TO = [
"function renderTrash(){",
"  const el=$(\"#screen\");",
"  const tr=(data.__trash||[]);",
"  const tTitle=t=>{ if(t.title) return String(t.title); if(t.content) return String(t.content).slice(0,40); if(t.amount!=null) return (t.type===\"income\"?\"收入 \":\"支出 \")+t.amount+(t.unit||\" 元\"); return \"无标题\"; };",
"  const rows=tr.map(t=>'<div class=\"rec\"><div style=\"display:flex;align-items:center;gap:10px;flex:1;min-width:0\">'",
"    +'<div style=\"flex:1;min-width:0\"><div style=\"font-weight:600;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'+esc(tTitle(t))+'</div>'",
"    +'<div style=\"font-size:12px;color:var(--text-tertiary);margin-top:2px\">来自 '+esc(trashModName(t.__module))+' · 删除于 '+esc(t.__deletedAt||\"—\")+'</div></div>'",
"    +'<button class=\"btn ghost js-tr-restore\" data-id=\"'+attr(String(t.id))+'\" data-mk=\"'+attr(String(t.__module||\"\"))+'\" style=\"font-size:12px;padding:4px 10px\">恢复</button>'",
"    +'<button class=\"btn ghost js-tr-purge\" data-id=\"'+attr(String(t.id))+'\" data-mk=\"'+attr(String(t.__module||\"\"))+'\" style=\"font-size:12px;padding:4px 10px;color:var(--danger,#b3403a)\">彻底删除</button></div></div>').join(\"\");",
"  el.innerHTML='<div style=\"display:flex;align-items:baseline;justify-content:space-between;padding:18px 0 6px;flex-wrap:wrap;gap:4px\"><h1 style=\"font-size:22px;margin:0\">回收站</h1><span style=\"font-size:12px;color:var(--text-tertiary)\">删除的记录保留 30 天，到期自动清除</span></div>'",
"    +(tr.length?rows:'<div class=\"rec\" style=\"justify-content:center;color:var(--text-tertiary)\">回收站是空的</div>')",
"    +(tr.length?'<div style=\"text-align:center;margin-top:14px\"><button class=\"btn ghost\" id=\"tr-empty\">清空回收站</button></div>':'');",
"  el.querySelectorAll(\".js-tr-restore\").forEach(b=>b.onclick=()=>restoreTrash(b.dataset.mk,b.dataset.id));",
"  el.querySelectorAll(\".js-tr-purge\").forEach(b=>b.onclick=()=>{ if(!confirm(\"彻底删除后无法恢复，确定？\"))return; purgeTrash(b.dataset.mk,b.dataset.id); });",
"  const eb=el.querySelector(\"#tr-empty\"); if(eb) eb.onclick=()=>{ if(!confirm(\"清空回收站？全部记录将被彻底删除。\"))return; data.__trash=[]; persist(); toast(\"回收站已清空\"); };",
"}",
"function trashModName(k){ const m=CONFIG.modules.find(x=>x.key===k); return m?m.name:(k||\"—\"); }",
"function restoreTrash(mk,id){",
"  const tr=data.__trash||[]; const i=tr.findIndex(t=>t.id==id&&t.__module===mk); if(i<0)return;",
"  const item=tr[i]; tr.splice(i,1); delete item.__module; delete item.__deletedAt;",
"  if(!data[mk]) data[mk]=[]; data[mk].unshift(item); persist(); toast(\"已恢复到「\"+trashModName(mk)+\"」\");",
"}",
"function purgeTrash(mk,id){ data.__trash=(data.__trash||[]).filter(t=>!(t.id==id&&t.__module===mk)); persist(); }",
"function confirmDelete(key,id){"
].join('\n');

/* ---------- R6 桌面侧栏加「回收站」入口 ---------- */
const R6_FROM = "    .concat([`<div class=\"nav-sep\">统计</div>`, `<div class=\"navi\" data-go=\"insight\">${icon(\"chart\",19)}洞察复盘</div>`]);";
const R6_TO   = "    .concat([`<div class=\"nav-sep\">统计</div>`, `<div class=\"navi\" data-go=\"insight\">${icon(\"chart\",19)}洞察复盘</div>`, `<div class=\"navi\" data-go=\"trash\">${icon(\"trash\",19)}回收站</div>`]);";

/* ---------- R7 桌面 render 分支加 trash ---------- */
const R7_FROM = "function render(){ if(view===\"home\") renderHome(); else if(view===\"insight\") renderInsight(); else renderModule(view); }";
const R7_TO   = "function render(){ if(view===\"home\") renderHome(); else if(view===\"insight\") renderInsight(); else if(view===\"trash\") renderTrash(); else renderModule(view); }";

/* ---------- R8 移动端抽屉加「回收站」入口 ---------- */
const R8_FROM = "    .concat([`<div class=\"ditem\" data-go=\"insight\">${icon(\"chart\",20)}洞察</div>`]);";
const R8_TO   = "    .concat([`<div class=\"ditem\" data-go=\"insight\">${icon(\"chart\",20)}洞察</div>`, `<div class=\"ditem\" data-go=\"trash\">${icon(\"trash\",20)}回收站</div>`]);";

/* ---------- R9 移动端顶栏标题分支 ---------- */
const R9_FROM = "  else { const m=modOf(view); $(\"#topTitle\").firstChild.textContent=m?m.name:\"我的工作台\"; $(\"#topSub\").textContent=m?m.desc:\"\"; }";
const R9_TO   = "  else if(view===\"trash\"){ $(\"#topTitle\").firstChild.textContent=\"回收站\"; $(\"#topSub\").textContent=\"已删除记录 · 30 天内可恢复\"; }\n  else { const m=modOf(view); $(\"#topTitle\").firstChild.textContent=m?m.name:\"我的工作台\"; $(\"#topSub\").textContent=m?m.desc:\"\"; }";

/* ---------- R10 移动端 render 主体分支 ---------- */
const R10_FROM = "  if(view===\"home\") renderHome();\n  else if(view===\"insight\") renderInsight();\n  else renderModule(view);";
const R10_TO   = "  if(view===\"home\") renderHome();\n  else if(view===\"insight\") renderInsight();\n  else if(view===\"trash\") renderTrash();\n  else renderModule(view);";

/* ---------- R11 导入前自动导出当前数据 ---------- */
const R11_FROM = "if(!confirm(\"导入将覆盖当前全部数据，确定继续？\")) return;";
const R11_TO   = "try{ exportData(); }catch(e){} if(!confirm(\"导入将覆盖当前全部数据。当前数据已自动导出为备份文件，确定继续？\")) return;";

/* ---------- R12 导出时打点 __lastExport（同步到云端，多端共享提醒状态） ---------- */
const R12_FROM = "function exportData(){";
const R12_TO   = "function exportData(){\n  try{ data.__lastExport=isoToday(); store.save(); }catch(e){}";

/* ---------- R13 启动时：回收站过期清理（30 天）+ 每周导出提醒 ---------- */
const R13_FROM = "sync.startAuto(); if(sync.on) sync.pull(true).then(()=>{ if((sync.cfg().rev||0)===0 && data && Object.keys(data).length) sync.push(); });";
const R13_TO = R13_FROM + "\n(function(){ try{" +
" var _cut=(function(){var _d=new Date();_d.setDate(_d.getDate()-30);return fmtLocal(_d);})();" +
" if((data.__trash||[]).length){ var _before=data.__trash.length; data.__trash=data.__trash.filter(function(t){ return !t.__deletedAt || t.__deletedAt>=_cut; }); if(data.__trash.length!==_before) store.saveLocal(); }" +
" var _has=CONFIG.modules.some(function(m){ return (data[m.key]||[]).length>0; });" +
" var _last=data.__lastExport||\"\";" +
" if(_has && (!_last || _last<=daysAgo(7))){ setTimeout(function(){ toast(\"距上次导出备份已超过 7 天，建议导出以防数据丢失\", { label:\"立即导出\", fn:function(){ exportData(); } }); }, 3000); }" +
" }catch(e){} })();";

/* ---------- R14 feature 大图布局用全尺寸图（不用 96px 缩略图） ---------- */
const R14_FROM = "  if(layout==='feature' && x.image){\n    const body=(x.content||x.note||'').trim();\n    return `<div class=\"rec ${layoutCls}\">${acts}<div class=\"top\" data-edit=\"${x.id}\">\n      ${thumb}";
const R14_TO   = "  if(layout==='feature' && x.image){\n    const body=(x.content||x.note||'').trim();\n    const bigImg=x.image?`<img class=\"thumb\" src=\"${attr(x.image)}\" alt=\"\" onerror=\"this.style.display='none'\">`:'';\n    return `<div class=\"rec ${layoutCls}\">${acts}<div class=\"top\" data-edit=\"${x.id}\">\n      ${bigImg}";

/* ================= 执行 ================= */
console.log('===== v1.5 补丁开始 =====');

WB.forEach(f => {
  apply(f, R2_FROM, R2_TO,  'R2 编辑器未保存提示', 1);
  apply(f, R3_FROM, R3_TO,  'R3 删除→回收站', 1);
  apply(f, R4_FROM, R4_TO,  'R4 撤销清回收站', 1);
  apply(f, R5_FROM, R5_TO,  'R5 回收站视图函数', 1);
  apply(f, R11_FROM, R11_TO, 'R11 导入前自动备份', 1);
  apply(f, R12_FROM, R12_TO, 'R12 导出打点', 1);
  apply(f, R13_FROM, R13_TO, 'R13 启动清理+提醒', 1);
  apply(f, R14_FROM, R14_TO, 'R14 feature全图', 1);
});
DESKTOP.forEach(f => {
  apply(f, R6_FROM, R6_TO, 'R6 桌面导航入口', 1);
  apply(f, R7_FROM, R7_TO, 'R7 桌面render分支', 1);
});
MOBILE.forEach(f => {
  apply(f, R8_FROM, R8_TO,  'R8 移动抽屉入口', 1);
  apply(f, R9_FROM, R9_TO,  'R9 移动标题分支', 1);
  apply(f, R10_FROM, R10_TO, 'R10 移动render分支', 1);
});
SWFILES.forEach(f => apply(f, R1_FROM, R1_TO, 'R1 SW注册+预热', 1));

/* ---------- sw.js：版本升级 + 预热消息监听 ---------- */
(function(){
  const f='sw.js'; let s=fs.readFileSync(f,'utf8');
  if(!s.includes("const CACHE = 'wb-v1.4.0';")){ console.log('✗ [sw.js] CACHE 版本锚点未命中'); misses++; }
  else s=s.replace("const CACHE = 'wb-v1.4.0';","const CACHE = 'wb-v1.5.0';").replace('工作台 Service Worker v1.4.0','工作台 Service Worker v1.5.0');
  if(s.includes("addEventListener('message'")){ console.log('⚠ [sw.js] message 监听已存在，跳过'); warns++; }
  else s += "\n/* v1.5: 页面注册成功后把当前页面 URL 发给 SW 预热，避免首次离线访问白屏 */\nself.addEventListener('message', e => {\n  const u = e.data && e.data.precache;\n  if (!u) return;\n  e.waitUntil(caches.open(CACHE).then(c => c.add(new URL(u, self.location.origin).href)).catch(() => {}));\n});\n";
  fs.writeFileSync(f,s);
  console.log('✓ [sw.js] 缓存版本 wb-v1.5.0 + message 预热');
})();

console.log('===== 补丁完成：未命中 ' + misses + '，异常命中 ' + warns + ' =====');
process.exit(misses ? 1 : 0);
