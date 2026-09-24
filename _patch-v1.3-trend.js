// _patch-v1.3-trend.js — v1.3：趋势图自动化 + 桌面版补齐「今日计划」环
//
// P0-1 趋势自动化：
//   · 新增每日状态分 trendScoreToday()（0-10 = 待办完成度 4 分 + 打卡完成度 4 分 + 当日有笔记 2 分）
//   · autoTrend() 把当日分数写入 data.__trendLog（按日期键），在 启动/每次保存/云端拉取后 自动打点
//   · 图表 series 优先读 __trendLog 近 7 天（覆盖≥4天启用，缺失日按 0），否则回退旧 __trend
//   · x 轴标签改为真实滚动 7 天的星期（原来固定写死一二三四五六日）
// P0-2 桌面版 overview 补上「今日计划」完成环（CSS 本来就是 4 列，桌面只放了 3 个）。

const fs = require('fs');
const path = require('path');
const dir = __dirname;

const HELPERS = `
/* ---- v1.3 趋势自动化：每日状态分（0-10）= 待办完成度 4 分 + 打卡完成度 4 分 + 当日有笔记 2 分 ---- */
function trendScoreToday(){
  const t=today(); let s=0;
  const todos=data.todo||[];
  if(todos.length) s+=4*todos.filter(x=>x.done).length/todos.length;
  const ci=data.checkin||[];
  if(ci.length) s+=4*ci.filter(x=>x.log&&x.log[t]).length/ci.length;
  if((data.note||[]).some(x=>x.date===t)) s+=2;
  return Math.round(s);
}
function autoTrend(){
  if(!data) return false;
  const t=today(), s=trendScoreToday();
  if(!data.__trendLog||typeof data.__trendLog!=="object") data.__trendLog={};
  if(data.__trendLog[t]===s) return false;
  data.__trendLog[t]=s; return true;
}
function trendXLabels(){
  const dn=["日","一","二","三","四","五","六"]; let out="";
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); out+="<span>"+dn[d.getDay()]+"</span>"; }
  return out;
}`;

// ---- 通用替换（8 个文件都适用）----
const COMMON = [
  // R1: trend.series 改为读 __trendLog（近7天，覆盖≥4天启用；缺失日记 0），回退旧 __trend
  {
    name: "trend.series 自动化",
    from: `  // 本周状态趋势（真实数据：读取用户填写的 __trend，7 个数字；没有就留空）
  trend: {
    title:"本周专注度趋势", unit:"分",
    series: d => (Array.isArray(d.__trend) && d.__trend.length===7) ? d.__trend : [],
  },`,
    to: `  // 本周状态趋势（v1.3 自动化：__trendLog 按日自动打点；近 7 天覆盖≥4天启用，缺失日记 0；无记录时回退旧 __trend）
  trend: {
    title:"本周专注度趋势", unit:"分",
    series: d => {
      const log=d.__trendLog;
      if(log && typeof log==="object"){
        const days=[]; for(let i=6;i>=0;i--) days.push(daysAgo(i));
        if(days.filter(k=>log[k]!=null).length>=4) return days.map(k=>log[k]==null?0:+log[k]);
      }
      return (Array.isArray(d.__trend) && d.__trend.length===7) ? d.__trend : [];
    },
  },`
  },
  // R2: store.load() 种子里同步铺 __trendLog（近 6 天用演示值，今天由 autoTrend 实时算）
  {
    name: "store.load 种子 __trendLog",
    from: `    // 默认趋势数据（近 7 天状态评分）
    d.__trend = [7, 6, 8, 5, 7, 8, 9];
    return d;`,
    to: `    // 默认趋势数据（近 7 天状态评分）
    d.__trend = [7, 6, 8, 5, 7, 8, 9];
    d.__trendLog = {};
    const seedTrend=[7, 6, 8, 5, 7, 8, 9];
    for(let i=0;i<6;i++) d.__trendLog[daysAgo(6-i)] = seedTrend[i];   // 前 6 天铺演示值，今天由 autoTrend 实时计算
    return d;`
  },
  // R4: store.save() 前先打点
  {
    name: "store.save 挂 autoTrend",
    from: `  save(){ this.saveLocal(); sync.schedulePush(); },`,
    to: `  save(){ autoTrend(); this.saveLocal(); sync.schedulePush(); },`
  },
  // R5: 启动时打点一次
  {
    name: "启动打点",
    from: `let data = store.load();`,
    to: `let data = store.load();
if(autoTrend()) store.saveLocal();   // v1.3 趋势分每日自动记录`
  },
  // R6: 云端拉取覆盖 data 后补打点（防止当日分数被云端旧数据冲掉）
  {
    name: "pull 后补打点",
    from: `        data = r.data; store.saveLocal();`,
    to: `        data = r.data; autoTrend(); store.saveLocal();`
  },
  // R7: x 轴标签改为真实滚动 7 天
  {
    name: "趋势 x 轴动态星期",
    from: `<div class="trend-x"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>`,
    to: `<div class="trend-x">\${trendXLabels()}</div>`
  },
  // R8: 空状态文案（不再引导手动记录）
  {
    name: "空状态文案",
    from: `暂无本周数据 · 在洞察中记录每日状态`,
    to: `暂无本周数据 · 完成待办与打卡后自动生成`
  },
  {
    name: "空状态文案(移动)",
    from: `<span>暂无本周数据</span>`,
    to: `<span>暂无本周数据 · 自动生成</span>`
  },
];

// ---- 仅桌面版：overview 补「今日计划」环 ----
const TODO_RING = `    { key:"todo", label:"今日计划", icon:"list", color:"var(--accent)",
      calc: d => { const it=d.todo||[]; const done=it.filter(x=>x.done).length; return { value: it.length?Math.round(done/it.length*100):0, sub:'${'{'}done${'}'}/${'{'}it.length${'}'} 项' }; } },
`;

const files = fs.readdirSync(dir).filter(f => /^workbench-.*\.html$/.test(f));

let ok = 0, fail = 0;
for (const f of files) {
  const fp = path.join(dir, f);
  let html = fs.readFileSync(fp, 'utf8');
  const isDesktop = !/-m\.html$/.test(f);
  const log = [];

  // 插入辅助函数：锚定第一处 daysAgo 定义，插到它后面
  const anchor = `function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }`;
  const ai = html.indexOf(anchor);
  if (ai === -1) { log.push("✗ 找不到 daysAgo 锚点"); }
  else if (html.includes("function autoTrend()")) { log.push("⏭ 已打过补丁，跳过函数插入"); }
  else {
    html = html.slice(0, ai + anchor.length) + "\n" + HELPERS + html.slice(ai + anchor.length);
    log.push("✓ 辅助函数");
  }

  // 通用替换
  for (const r of COMMON) {
    if (html.includes(r.from)) {
      html = html.split(r.from).join(r.to);
      log.push("✓ " + r.name);
    } else if (html.includes(r.name.includes("移动") ? r.to : r.to.slice(0, 30))) {
      log.push("⏭ " + r.name + "（已是新代码）");
    } else {
      log.push("✗ " + r.name + "（锚点未命中）");
    }
  }

  // 桌面版：插入 todo 环
  if (isDesktop) {
    const ringAnchor = `    { key:"checkin", label:"习惯打卡", icon:"leaf", color:"var(--module-1)",`;
    if (html.includes('key:"todo", label:"今日计划"')) {
      log.push("⏭ todo 环已存在");
    } else if (html.includes(ringAnchor)) {
      const todoRing = TODO_RING
        .replace(/\$\{'\{'\}/g, "${")
        .replace(/\$\{'\}'\}/g, "}");
      // 直接构造（避免上面占位符转换出错，重新写一遍）
      const ring = `    { key:"todo", label:"今日计划", icon:"list", color:"var(--accent)",
      calc: d => { const it=d.todo||[]; const done=it.filter(x=>x.done).length; return { value: it.length?Math.round(done/it.length*100):0, sub:\`\${done}/\${it.length} 项\` }; } },
`;
      html = html.replace(ringAnchor, ring + ringAnchor);
      log.push("✓ todo 完成环");
    } else {
      log.push("✗ todo 完成环（锚点未命中）");
    }
  }

  const hasFail = log.some(l => l.startsWith("✗"));
  if (hasFail) fail++; else ok++;
  console.log(`\n${hasFail ? "⚠️" : "✅"} ${f}`);
  log.forEach(l => console.log("   " + l));
  fs.writeFileSync(fp, html, 'utf8');
}

console.log(`\n完成：${ok} 成功 / ${fail} 有未命中项`);
