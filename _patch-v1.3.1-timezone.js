// _patch-v1.3.1-timezone.js — v1.3.1：日期全链路本地时间化（修复 UTC 时区雷）
//
// 问题：isoToday()/daysAgo()/weekDates()/streak()/checkRecurring() 全部用 toISOString()（UTC）。
//       中国 UTC+8，每天 00:00–08:00 之间"今天"被记成昨天 —— 打卡断签、趋势错位、周视图串行。
// 修复：新增 fmtLocal(d)（本地日期 → "YYYY-MM-DD"），所有日期键统一走本地时间。
// 顺手：删除 daysAgo 的重复定义（每个文件里有 2 份一模一样的）。
// 兼容：历史数据无需迁移 —— 日期键格式不变，仅早期凌晨写的条目日期 ±1 天（纯展示差异）。

const fs = require('fs');
const path = require('path');
const dir = __dirname;

const UTC_DAYSAGO = `function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }`;
const LOCAL_DAYSAGO = `function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return fmtLocal(d); }`;
const LOCAL_DAYSAGO_LINE = LOCAL_DAYSAGO + "\n";

const RULES = [
  // R1: isoToday 本地化，并在其前注入 fmtLocal
  {
    name: "fmtLocal + isoToday 本地化",
    from: `function isoToday(){ return new Date().toISOString().slice(0,10); }`,
    to: `function fmtLocal(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }   // v1.3.1 本地日期，替代 toISOString(UTC)\nfunction isoToday(){ return fmtLocal(new Date()); }`
  },
  // R2: daysAgo 全部本地化（replaceAll，含重复定义）
  {
    name: "daysAgo 本地化(全部)",
    from: UTC_DAYSAGO,
    to: LOCAL_DAYSAGO,
    all: true
  },
  // R3: 删除重复的 daysAgo（第二份定义紧跟 avgProgress）
  {
    name: "去重 daysAgo",
    from: LOCAL_DAYSAGO_LINE + `function avgProgress(list){`,
    to: `function avgProgress(list){`
  },
  // R4: weekDates 周一到周日
  {
    name: "weekDates 本地化",
    from: `arr.push(d.toISOString().slice(0,10)); }`,
    to: `arr.push(fmtLocal(d)); }`
  },
  // R5: streak 循环（桌面版变量名 k）
  {
    name: "streak 本地化(桌面)",
    from: `for(;;){ const k=d.toISOString().slice(0,10); if(log[k]){ n++; d.setDate(d.getDate()-1);} else break; } return n; }`,
    to: `for(;;){ const k=fmtLocal(d); if(log[k]){ n++; d.setDate(d.getDate()-1);} else break; } return n; }`
  },
  // R5b: streak 循环（移动版变量名 key）
  {
    name: "streak 本地化(移动)",
    from: `for(;;){ const key=d.toISOString().slice(0,10); if(log[key]){ n++; d.setDate(d.getDate()-1); } else break; }`,
    to: `for(;;){ const key=fmtLocal(d); if(log[key]){ n++; d.setDate(d.getDate()-1); } else break; }`
  },
  // R6: 周期任务判断
  {
    name: "checkRecurring 本地化",
    from: `const today = new Date().toISOString().slice(0,10);`,
    to: `const today = isoToday();`
  },
];

const files = fs.readdirSync(dir).filter(f => /^workbench-.*\.html$/.test(f));
let ok = 0, fail = 0;

for (const f of files) {
  const fp = path.join(dir, f);
  let html = fs.readFileSync(fp, 'utf8');
  const log = [];
  const isDesktop = !/-m\.html$/.test(f);

  if (html.includes("fmtLocal")) { console.log("⏭ " + f + " 已打过补丁，跳过"); continue; }

  for (const r of RULES) {
    if (r.name === "streak 本地化(桌面)" && !isDesktop) continue;   // 桌面专属
    if (r.name === "streak 本地化(移动)" && isDesktop) continue;    // 移动专属
    if (html.includes(r.from)) {
      html = r.all ? html.split(r.from).join(r.to) : html.replace(r.from, r.to);
      log.push("✓ " + r.name);
    } else {
      log.push("✗ " + r.name);
    }
  }

  const hasFail = log.some(l => l.startsWith("✗"));
  if (hasFail) fail++; else ok++;
  console.log((hasFail ? "⚠️ " : "✅ ") + f);
  log.forEach(l => console.log("   " + l));
  fs.writeFileSync(fp, html, 'utf8');
}

console.log(`\n完成：${ok} 成功 / ${fail} 有未命中项`);
