#!/usr/bin/env node
/* v1.6 补丁：数据价值批次
 * 1. 趋势分项构成: 图表下新增 今日 N 分 = 待办 a + 打卡 b + 笔记 c   — PM#8 李志强
 * 2. 跨月对比: 记账汇总改为本月口径 + 支出较上月 ↑↓% ; 首页月度开销按月过滤 — PM#9 李志强
 * 3. 周期账单: 编辑器加 重复(每周/每月/每年), 启动自动生成到期账单, 列表 🔄 标记 — PM#24 李志强
 * 4. 待办过滤修复: v1.1 的 initArchive 因 .rec 无 data-id / 移动端无 .toolbar 一直是死功能,
 *    改为 #screen 委托 + data-edit 回退, 双端激活 全部/未完成/已完成                    — PM#10 李志强
 * 5. 搜索澄清: 模块内搜索框占位符改为「本模块内搜索…」(头部全局搜索本就存在且跳转正常) — PM#21 王芳
 * 用法: /usr/local/bin/node _patch-v1.6.js   (split/join 字面量替换, 无 $ 陷阱) */
const fs = require('fs');

const DESKTOP = ['workbench-amber.html','workbench-mint.html','workbench-mocha.html','workbench-rose.html'];
const MOBILE  = ['workbench-amber-m.html','workbench-mint-m.html','workbench-mocha-m.html','workbench-rose-m.html'];
const WB      = DESKTOP.concat(MOBILE);

let misses = 0, warns = 0;
const CHECK = process.argv.includes('--check');
function apply(file, from, to, label, expect, mark) {
  let s;
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { console.log('✗ [' + file + '] ' + label + ' — 读文件失败'); misses++; return; }
  const mk = mark || to;
  if (mk && s.split(mk).length - 1 > 0) { console.log('↷ [' + file + '] ' + label + ' — 已应用，跳过'); return; }
  const n = s.split(from).length - 1;
  if (n === 0) { console.log('✗ [' + file + '] ' + label + ' — 锚点未命中'); misses++; return; }
  if (expect && n !== expect) { console.log('⚠ [' + file + '] ' + label + ' — 命中 ' + n + '（预期 ' + expect + '）'); warns++; }
  if (CHECK) { console.log('· [' + file + '] ' + label + ' — 干跑命中 ' + n); return; }
  fs.writeFileSync(file, s.split(from).join(to));
  console.log('✓ [' + file + '] ' + label + ' ×' + n);
}

/* ---------- V1 公共助手: ymOffset / trendBreakdown / trendBDLine / recurNext / initRecurBills ---------- */
const V1_FROM = 'function autoTrend(){';
const V1_TO = [
'function ymOffset(n){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }',
'function trendBreakdown(){',
'  const t=today(); const todos=data.todo||[]; const ci=data.checkin||[]; const notes=data.note||[];',
'  const td=todos.length?4*todos.filter(x=>x.done).length/todos.length:0;',
'  const ck=ci.length?4*ci.filter(x=>x.log&&x.log[t]).length/ci.length:0;',
'  const nt=notes.some(x=>x.date===t)?2:0;',
'  return { s:Math.round(td+ck+nt), td:Math.round(td), ck:Math.round(ck), nt, full:todos.length>0||ci.length>0||notes.some(x=>x.date===t) };',
'}',
'function trendBDLine(has){',
'  if(!has) return "";',
'  const b=trendBreakdown();',
'  const cap=\'<span style="opacity:.75">（待办 0-4 · 打卡 0-4 · 笔记 +2）</span>\';',
'  if(!b.full) return \'<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:12px;color:var(--text-tertiary)">今日暂无计入项 · 完成待办/打卡或写笔记自动累计 \'+cap+\'</div>\';',
'  return \'<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:12px;color:var(--text-tertiary)">今日 <b style="color:var(--text)">\'+b.s+\'</b>\'+(CONFIG.trend.unit||" 分")+\' = 待办 \'+b.td+\' + 打卡 \'+b.ck+\' + 笔记 \'+b.nt+\' \'+cap+\'</div>\';',
'}',
'function recurNext(ds,freq){ const d=new Date(ds+"T00:00:00"); if(freq==="week") d.setDate(d.getDate()+7); else if(freq==="month") d.setMonth(d.getMonth()+1); else d.setFullYear(d.getFullYear()+1); return fmtLocal(d); }',
'function initRecurBills(){',
'  const list=data.money||[]; if(!list.length) return; let changed=false; const earliest=daysAgo(30);',
'  list.forEach(tpl=>{',
'    if(!tpl.recur) return;',
'    if(!tpl.nextDue){ tpl.nextDue=recurNext(tpl.date||isoToday(),tpl.recur); changed=true; }',
'    let guard=0;',
'    while(tpl.nextDue && tpl.nextDue<=isoToday() && guard<12){',
'      if(tpl.nextDue>=earliest){ data.money.push({ id:Date.now()+Math.floor(Math.random()*1000)+guard, type:tpl.type, amount:tpl.amount, category:tpl.category||"其他", title:(tpl.title||"周期账单"), date:tpl.nextDue, fromRecur:true }); }',
'      tpl.nextDue=recurNext(tpl.nextDue,tpl.recur); changed=true; guard++;',
'    }',
'  });',
'  if(changed) persist();',
'}',
'function autoTrend(){'
].join('\n');

/* ---------- V2 记账汇总: 本月口径 + 较上月(桌面) ---------- */
const V2_FROM = [
'    const inc=all.filter(x=>x.type==="income").reduce((a,x)=>a+ +x.amount,0);',
'    const exp=all.filter(x=>x.type==="expense").reduce((a,x)=>a+ +x.amount,0);',
'    head=`<div class="mod-summary">',
'      <div class="mini"><div class="l">收入</div><div class="v" style="color:var(--module-1)">¥${inc}</div></div>',
'      <div class="mini"><div class="l">支出</div><div class="v" style="color:var(--danger)">¥${exp}</div></div>',
'      <div class="mini"><div class="l">结余</div><div class="v">¥${inc-exp}</div></div>',
'      <div class="mini"><div class="l">笔数</div><div class="v">${all.length}</div></div></div>`;'
].join('\n');
const V2_TO = [
'    const ym=ymOffset(0), ymp=ymOffset(-1);',
'    const cur=all.filter(x=>(x.date||"").startsWith(ym));',
'    const inc=cur.filter(x=>x.type==="income").reduce((a,x)=>a+ +x.amount,0);',
'    const exp=cur.filter(x=>x.type==="expense").reduce((a,x)=>a+ +x.amount,0);',
'    const prev=all.filter(x=>(x.date||"").startsWith(ymp)&&x.type==="expense").reduce((a,x)=>a+ +x.amount,0);',
'    const _d=prev?Math.round((exp-prev)/prev*100):null;',
'    const _dl=_d==null?"":\'<span style="font-size:11px;font-weight:400;color:\'+(_d>0?"var(--danger)":"var(--module-1)")+\'">\'+(_d>0?"↑":"↓")+Math.abs(_d)+\'%</span>\';',
'    head=`<div class="mod-summary">',
'      <div class="mini"><div class="l">收入</div><div class="v" style="color:var(--module-1)">¥${inc}</div></div>',
'      <div class="mini"><div class="l">支出</div><div class="v" style="color:var(--danger)">¥${exp}${_dl}</div></div>',
'      <div class="mini"><div class="l">结余</div><div class="v">¥${inc-exp}</div></div>',
'      <div class="mini"><div class="l">笔数</div><div class="v">${cur.length}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary)"> 本月</span></div></div></div>`;'
].join('\n');

/* ---------- V3 记账汇总: 本月口径 + 较上月(移动) ---------- */
const V3_FROM = [
'    const inc=it.filter(x=>x.type==="income").reduce((s,x)=>s+ +x.amount,0);',
'    const exp=it.filter(x=>x.type==="expense").reduce((s,x)=>s+ +x.amount,0);',
'    head=`<div class="mod-summary">',
'      <div class="mini"><div class="l">收入</div><div class="v" style="color:var(--module-1)">¥${inc}</div></div>',
'      <div class="mini"><div class="l">支出</div><div class="v" style="color:var(--danger)">¥${exp}</div></div>',
'      <div class="mini"><div class="l">结余</div><div class="v">¥${inc-exp}</div></div></div>`;'
].join('\n');
const V3_TO = [
'    const ym=ymOffset(0), ymp=ymOffset(-1);',
'    const cur=it.filter(x=>(x.date||"").startsWith(ym));',
'    const inc=cur.filter(x=>x.type==="income").reduce((s,x)=>s+ +x.amount,0);',
'    const exp=cur.filter(x=>x.type==="expense").reduce((s,x)=>s+ +x.amount,0);',
'    const prev=it.filter(x=>(x.date||"").startsWith(ymp)&&x.type==="expense").reduce((s,x)=>s+ +x.amount,0);',
'    const _d=prev?Math.round((exp-prev)/prev*100):null;',
'    const _dl=_d==null?"":\'<span style="font-size:11px;font-weight:400;color:\'+(_d>0?"var(--danger)":"var(--module-1)")+\'">\'+(_d>0?"↑":"↓")+Math.abs(_d)+\'%</span>\';',
'    head=`<div class="mod-summary">',
'      <div class="mini"><div class="l">收入</div><div class="v" style="color:var(--module-1)">¥${inc}</div></div>',
'      <div class="mini"><div class="l">支出</div><div class="v" style="color:var(--danger)">¥${exp}${_dl}</div></div>',
'      <div class="mini"><div class="l">结余</div><div class="v">¥${inc-exp}</div></div></div>`;'
].join('\n');

/* ---------- V4 记账编辑器加「重复」段选(桌面) ---------- */
const V4_FROM = [
'      <div class="field"><label>分类</label><div class="seg" id="f-cat">${(m.categories||[]).map(c=>`<div class="opt ${c===d.category?\'on\':\'\'}" data-v="${attr(c)}" style="flex:0 0 auto;min-width:auto">${esc(c)}</div>`).join("")}</div></div>',
'      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date||isoToday()}"/></div>`;'
].join('\n');
const V4_TO = [
'      <div class="field"><label>分类</label><div class="seg" id="f-cat">${(m.categories||[]).map(c=>`<div class="opt ${c===d.category?\'on\':\'\'}" data-v="${attr(c)}" style="flex:0 0 auto;min-width:auto">${esc(c)}</div>`).join("")}</div></div>',
'      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date||isoToday()}"/></div>',
'      <div class="field"><label>重复</label><div class="seg" id="f-recur"><div class="opt ${!d.recur?\'on\':\'\'}" data-v="">不重复</div><div class="opt ${d.recur===\'week\'?\'on\':\'\'}" data-v="week">每周</div><div class="opt ${d.recur===\'month\'?\'on\':\'\'}" data-v="month">每月</div><div class="opt ${d.recur===\'year\'?\'on\':\'\'}" data-v="year">每年</div></div></div>`;'
].join('\n');

/* ---------- V5 记账编辑器加「重复」段选(移动) ---------- */
const V5_FROM = [
'      <div class="field"><label>分类</label><div class="seg" style="flex-wrap:wrap" id="f-cat">${(m.categories||[]).map(c=>`<div class="opt ${c===d.category?\'on\':\'\'}" data-v="${attr(c)}" style="flex:0 0 auto">${esc(c)}</div>`).join("")}</div></div>',
'      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date||isoToday()}"/></div>`;'
].join('\n');
const V5_TO = [
'      <div class="field"><label>分类</label><div class="seg" style="flex-wrap:wrap" id="f-cat">${(m.categories||[]).map(c=>`<div class="opt ${c===d.category?\'on\':\'\'}" data-v="${attr(c)}" style="flex:0 0 auto">${esc(c)}</div>`).join("")}</div></div>',
'      <div class="field"><label>日期</label><input id="f-date" type="date" value="${d.date||isoToday()}"/></div>',
'      <div class="field"><label>重复</label><div class="seg" id="f-recur"><div class="opt ${!d.recur?\'on\':\'\'}" data-v="">不重复</div><div class="opt ${d.recur===\'week\'?\'on\':\'\'}" data-v="week">每周</div><div class="opt ${d.recur===\'month\'?\'on\':\'\'}" data-v="month">每月</div><div class="opt ${d.recur===\'year\'?\'on\':\'\'}" data-v="year">每年</div></div></div>`;'
].join('\n');

/* ---------- V6 保存分支: 写入 recur/nextDue ---------- */
const V6_FROM = '    else if(m.type==="finance"){ d.type=seg("#f-ftype")||"expense"; d.amount=Math.max(0,+val("#f-amt")||0); d.category=seg("#f-cat")||(m.categories&&m.categories[0])||"其他"; d.date=val("#f-date"); }';
const V6_TO   = '    else if(m.type==="finance"){ d.type=seg("#f-ftype")||"expense"; d.amount=Math.max(0,+val("#f-amt")||0); d.category=seg("#f-cat")||(m.categories&&m.categories[0])||"其他"; d.date=val("#f-date"); d.recur=seg("#f-recur")||""; if(d.recur){ d.nextDue=recurNext(d.date||isoToday(),d.recur); } else { delete d.nextDue; } }';

/* ---------- V7 记账行 🔄 周期标记 ---------- */
const V7_FROM = '<span class="badge" style="background:var(--surface-nested);color:var(--text-secondary)">${esc(x.category||\'其他\')}</span>';
const V7_TO   = '<span class="badge" style="background:var(--surface-nested);color:var(--text-secondary)">${esc(x.category||\'其他\')}</span>${x.recur?\'<span class="badge" style="background:var(--surface-nested);color:var(--text-secondary)">🔄 \'+(x.recur===\'week\'?\'每周\':(x.recur===\'month\'?\'每月\':\'每年\'))+\'</span>\':\'\'}';

/* ---------- V8 首页月度开销按本月过滤(桌面) ---------- */
const V8_FROM = 'function spendTileHTML(){\n  const all=data.money||[]; const exp=all.filter(x=>x.type==="expense").reduce((a,x)=>a+ +x.amount,0);';
const V8_TO   = 'function spendTileHTML(){\n  const all=(data.money||[]).filter(x=>(x.date||"").startsWith(ymOffset(0))); const exp=all.filter(x=>x.type==="expense").reduce((a,x)=>a+ +x.amount,0);';

/* ---------- V9 桌面趋势卡: 图表下加分项构成行 ---------- */
const V9_FROM = '    ${body}${has?`<div class="trend-x">${trendXLabels()}</div>`:\'\'}</div>`;';
const V9_TO   = '    ${body}${has?`<div class="trend-x">${trendXLabels()}</div>`:\'\'}'
              + '${trendBDLine(has)}</div>`;';

/* ---------- V10 移动端首页趋势: 加分项构成行 ---------- */
const V10_FROM = '      ${trend}${hasTrend?`<div class="trend-x">${trendXLabels()}</div>`:\'\'}</div>`;';
const V10_TO   = '      ${trend}${hasTrend?`<div class="trend-x">${trendXLabels()}</div>`:\'\'}'
               + '${trendBDLine(hasTrend)}</div>`;';

/* ---------- V11-V14 待办过滤激活(双端同锚点) ---------- */
const V11_FROM = "          const tb=document.querySelector('.toolbar');\n          if(tb&&!tb.querySelector('.todo-filter')){";
const V11_TO   = "          const tb=document.querySelector('.toolbar');\n          const _g=document.querySelector('#screen .rec');\n          if(!document.querySelector('.todo-filter')&&(tb||_g)){";
const V12_FROM = "            tb.appendChild(f);";
const V12_TO   = "            if(tb) tb.appendChild(f); else if(_g){ f.style.margin='0 0 12px'; _g.parentNode.insertBefore(f,_g); }";
const V13_FROM = "        const grid=document.querySelector('.rec-grid');if(!grid)return;";
const V13_TO   = "        const grid=document.querySelector('#screen');if(!grid)return;";
const V14_FROM = "          const id=el.dataset.id||el.dataset.rid||el.getAttribute('data-id');";
const V14_TO   = "          const _ed=el.querySelector('[data-edit]'); const id=el.dataset.id||el.dataset.rid||(_ed&&_ed.dataset.edit)||el.getAttribute('data-id');";

/* ---------- V15 模块内搜索占位符澄清(桌面) ---------- */
const V15_FROM = 'placeholder="搜索…"';
const V15_TO   = 'placeholder="本模块内搜索…"';

/* ---------- V16 启动时生成周期账单 ---------- */
const V16_FROM = 'fn:function(){ exportData(); } }); }, 3000); } }catch(e){} })();';
const V16_TO   = 'fn:function(){ exportData(); } }); }, 3000); } }catch(e){} })();\n(function(){ try{ initRecurBills(); }catch(e){} })();';

/* ---------- V17 recurNext 月末钳制(1-31 +1月 → 2-28 而非溢出到 3-03) ---------- */
const V17_FROM = 'function recurNext(ds,freq){ const d=new Date(ds+"T00:00:00"); if(freq==="week") d.setDate(d.getDate()+7); else if(freq==="month") d.setMonth(d.getMonth()+1); else d.setFullYear(d.getFullYear()+1); return fmtLocal(d); }';
const V17_TO   = 'function recurNext(ds,freq){ const d=new Date(ds+"T00:00:00"); const _day=d.getDate(); if(freq==="week") d.setDate(d.getDate()+7); else if(freq==="month") d.setMonth(d.getMonth()+1); else d.setFullYear(d.getFullYear()+1); if(freq!=="week"&&d.getDate()!==_day) d.setDate(0); return fmtLocal(d); }';

/* ---------- V18 过滤器重渲染后重应用(勾待办触发 render 会重建行, 过滤失效) ---------- */
const V18A_FROM = "          if(!document.querySelector('.todo-filter')&&(tb||_g)){";
const V18A_TO   = "          const _tf=document.querySelector('.todo-filter');\n          if(!_tf&&(tb||_g)){";
const V18B_FROM = "            applyTodoFilter();\n          }";
const V18B_TO   = "            applyTodoFilter();\n          } else if(_tf) applyTodoFilter();";

/* ================= 执行 ================= */
console.log('===== v1.6 补丁开始 =====');
WB.forEach(f => {
  apply(f, V1_FROM, V1_TO,  'V1 公共助手', 1, 'function trendBDLine(has){');
  apply(f, V6_FROM, V6_TO,  'V6 保存recur', 1);
  apply(f, V7_FROM, V7_TO,  'V7 周期标记', 1);
  apply(f, V11_FROM, V11_TO, 'V11 过滤守卫', 1, "const _g=document.querySelector('#screen .rec');");
  apply(f, V12_FROM, V12_TO, 'V12 过滤注入点', 1);
  apply(f, V13_FROM, V13_TO, 'V13 过滤容器', 1);
  apply(f, V14_FROM, V14_TO, 'V14 data-edit回退', 1);
  apply(f, V16_FROM, V16_TO, 'V16 启动生成账单', 1);
  apply(f, V17_FROM, V17_TO, 'V17 月末钳制', 1);
  apply(f, V18A_FROM, V18A_TO, 'V18a 过滤守卫2', 1);
  apply(f, V18B_FROM, V18B_TO, 'V18b 重渲染重应用', 1);
});
DESKTOP.forEach(f => {
  apply(f, V2_FROM, V2_TO, 'V2 记账本月+对比', 1);
  apply(f, V4_FROM, V4_TO, 'V4 编辑器重复段', 1);
  apply(f, V8_FROM, V8_TO, 'V8 月度开销过滤', 1);
  apply(f, V9_FROM, V9_TO, 'V9 趋势分项行', 1);
  apply(f, V15_FROM, V15_TO, 'V15 搜索占位符', 1);
});
MOBILE.forEach(f => {
  apply(f, V3_FROM, V3_TO, 'V3 记账本月+对比', 1);
  apply(f, V5_FROM, V5_TO, 'V5 编辑器重复段', 1);
  apply(f, V10_FROM, V10_TO, 'V10 趋势分项行', 1);
});
console.log('===== 补丁完成：未命中 ' + misses + '，异常命中 ' + warns + ' =====');
process.exit(misses ? 1 : 0);
