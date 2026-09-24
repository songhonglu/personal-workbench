#!/usr/bin/env node
/* ============================================================
   _patch-v1.8.js — 清尾批次
   M1  exportedAt 本地化(YYYY-MM-DD HH:mm)
   M2  sync 字段级合并方法注入(_base/_saveBase/mergeData/_mergeKey)
   M3  push 成功后存基准快照
   M4  pull 整替 → 三路合并 + 基准 + 合并后推回云端
   M5  applySkin 内动态更新 meta theme-color(读 --page-bg)
   M6  暴露 window.__syncThemeColor 供深色切换调用
   M7  🌙 onclick 后刷新 theme-color
   M8  同步钩子主题应用后刷新 theme-color
   用法: node _patch-v1.8.js [--check]
   ============================================================ */
const fs = require("fs");
const D = __dirname + "/";
const CHECK = process.argv.includes("--check");
const failures = [];
function apply(file, from, to, expect, mark) {
  const p = D + file, s = fs.readFileSync(p, "utf8");
  if (mark && s.includes(mark)) { console.log("↷ 跳过(已应用) " + file + " :: " + mark.slice(0, 40)); return; }
  const n = s.split(from).length - 1;
  if (n !== expect) { console.log("✗ MISS " + file + " :: 期望" + expect + " 实际" + n + " :: " + from.slice(0, 60).replace(/\n/g, "⏎")); failures.push(file + " :: " + from.slice(0, 50)); return; }
  if (!CHECK) { fs.writeFileSync(p, s.split(from).join(to)); console.log("✓ " + file + " :: " + n + " 处替换"); }
  else console.log("✓(干跑) " + file + " :: " + n + " 处命中");
}
const FILES = ["workbench.html", "workbench-m.html"];

/* M1: exportedAt 本地化 */
apply("workbench.html", 'exportedAt:new Date().toISOString(),',
  'exportedAt:(d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"))(new Date()),',
  1, "exportedAt:(d=>d.getFullYear");
apply("workbench-m.html", 'exportedAt:new Date().toISOString(),',
  'exportedAt:(d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"))(new Date()),',
  1, "exportedAt:(d=>d.getFullYear");

/* M2: sync 合并方法注入 */
const METHODS =
"  _baseKey(){ return SYNC_KEY+\"::base\"; },\n" +
"  _saveBase(d){ try{ storage.setItem(this._baseKey(), JSON.stringify(d)); }catch(e){} },\n" +
"  _base(){ try{ const s=storage.getItem(this._baseKey()); return s?JSON.parse(s):null; }catch(e){ return null; } },\n" +
"  _mergeKey(L,R,B){\n" +
"    if(Array.isArray(L)&&Array.isArray(R)){\n" +
"      if(L.some(i=>!i||i.id==null)||R.some(i=>!i||i.id==null)) return L;\n" +
"      const Bm={};(B||[]).forEach(i=>{ if(i&&i.id!=null) Bm[i.id]=i; });\n" +
"      const Lm={},order=[]; L.forEach(i=>{ Lm[i.id]=i; order.push(i.id); });\n" +
"      const Rm={}; R.forEach(i=>{ Rm[i.id]=i; });\n" +
"      const ids=order.slice(); Object.keys(Rm).forEach(id=>{ if(!(id in Lm)) ids.push(id); });\n" +
"      const out=[];\n" +
"      ids.forEach(id=>{ const b=Bm[id],l=Lm[id],r=Rm[id];\n" +
"        if(l&&r){ const lc=!b||JSON.stringify(l)!==JSON.stringify(b); const rc=!b||JSON.stringify(r)!==JSON.stringify(b); out.push(rc&&!lc?r:l); }\n" +
"        else if(l) out.push(l); else if(r) out.push(r); });\n" +
"      return out;\n" +
"    }\n" +
"    return R;\n" +
"  },\n" +
"  mergeData(remote){\n" +
"    const base=this._base(); if(!base) return remote;\n" +
"    try{\n" +
"      const merged={}; const keys=new Set([...Object.keys(remote),...Object.keys(data)]);\n" +
"      keys.forEach(k=>{ const L=data[k],R=remote[k],B=base[k];\n" +
"        const lc=JSON.stringify(L)!==JSON.stringify(B), rc=JSON.stringify(R)!==JSON.stringify(B);\n" +
"        if(!rc) merged[k]=L; else if(!lc) merged[k]=R; else merged[k]=this._mergeKey(L,R,B); });\n" +
"      console.info(\"[sync] 字段级合并完成\"); return merged;\n" +
"    }catch(e){ console.warn(\"[sync] 合并失败, 回退整替:\", e); return remote; }\n" +
"  },\n";
FILES.forEach(f => apply(f, "  async now(){ await this.pull(false); await this.push(); },", METHODS + "  async now(){ await this.pull(false); await this.push(); },", 1, "_baseKey(){ return SYNC_KEY"));

/* M3: push 成功后存基准 */
FILES.forEach(f => apply(f,
  '      this.set("lastSync", Date.now()); this.badge("已同步");',
  '      this.set("lastSync", Date.now()); this._saveBase(data); this.badge("已同步");',
  1, "this._saveBase(data); this.badge"));

/* M4: pull 整替 → 合并 */
const PULL_FROM =
"      if(r && r.data!=null && (r.rev||0) > localRev){\n" +
"        data = r.data; autoTrend(); store.saveLocal();\n" +
'        this.set("rev", r.rev); if(r.updatedAt) this.set("updatedAt", r.updatedAt);\n' +
'        this.set("lastSync", Date.now()); render();\n' +
'        if(!silent) toast("已从云端拉取最新数据"); this.badge("已同步");\n' +
'      } else if(!silent){ toast("本地已是最新"); }';
const PULL_TO =
"      if(!this._base()) this._saveBase(data);\n" +
"      if(r && r.data!=null && (r.rev||0) > localRev){\n" +
"        const _remote=r.data; data = this.mergeData(_remote); autoTrend(); store.saveLocal();\n" +
'        this.set("rev", r.rev); if(r.updatedAt) this.set("updatedAt", r.updatedAt);\n' +
'        this.set("lastSync", Date.now()); this._saveBase(data); render();\n' +
'        if(JSON.stringify(data)!==JSON.stringify(_remote)){ this.schedulePush(); if(!silent) toast("已合并本地与云端数据"); this.badge("已同步"); }\n' +
'        else { if(!silent) toast("已从云端拉取最新数据"); this.badge("已同步"); }\n' +
'      } else if(!silent){ toast("本地已是最新"); }';
FILES.forEach(f => apply(f, PULL_FROM, PULL_TO, 1, "if(!this._base()) this._saveBase(data);"));

/* M5: applySkin 内动态 theme-color */
FILES.forEach(f => apply(f,
  '    document.title=s.emoji+" 我的工作台 · "+s.name;',
  '    document.title=s.emoji+" 我的工作台 · "+s.name;\n' +
  "    var mt=document.querySelector('meta[name=\"theme-color\"]'); if(mt){ try{ var cs=getComputedStyle(d); var pv=(cs.getPropertyValue(\"--page-bg\")||\"\").trim(); if(pv) mt.setAttribute(\"content\", pv); }catch(e){} }",
  1, "var mt=document.querySelector('meta[name=\"theme-color\"]')"));

/* M6: 暴露 __syncThemeColor */
FILES.forEach(f => apply(f,
  "  window.applySkin=applySkin;",
  "  window.applySkin=applySkin;\n  window.__syncThemeColor=function(){ try{ applySkin((typeof data!==\"undefined\"&&data.__skin)||\"amber\"); }catch(e){} };",
  1, "window.__syncThemeColor=function"));

/* M7: 🌙 onclick 后刷新 theme-color */
FILES.forEach(f => apply(f,
  "        update();\n      };",
  "        update();\n        window.__syncThemeColor && window.__syncThemeColor();\n      };",
  1, "update();\n        window.__syncThemeColor && window.__syncThemeColor();"));

/* M8: 同步钩子主题应用后刷新 theme-color */
FILES.forEach(f => apply(f,
  '        if (btn) btn.textContent = data.__theme === "dark" ? "☀️" : "🌙";',
  '        if (btn) btn.textContent = data.__theme === "dark" ? "☀️" : "🌙";\n        window.__syncThemeColor && window.__syncThemeColor();',
  1, '"☀️" : "🌙";\n        window.__syncThemeColor && window.__syncThemeColor();'));

console.log("");
if (failures.length) { console.log("✗ 失败 " + failures.length + " 处："); failures.forEach(x => console.log("   - " + x)); process.exit(1); }
console.log(CHECK ? "—— 干跑完成 ——" : "—— v1.8 补丁完成 ——");
