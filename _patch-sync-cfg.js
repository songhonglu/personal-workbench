// 为 8 个工作台页面 + 2 个技能模板接入 Cloudflare Worker 默认同步配置
// 规则：localStorage 无同步配置 → 默认连 Worker；已有配置中是 http:// 局域网地址 → 自动升级为 Worker
const fs = require("fs");
const path = require("path");

const BASE = "/Users/songhw/BDWPS/mac/码道CodeArts/个人工作台";
const SKILL = "/Users/songhw/.codearts/skills/workbench-pro/templates";
const WORKER_URL = "https://workbench-sync.chen529173628.workers.dev";
const TOKEN = "wb-12140654b07374a41aebecae";

const files = [
  ...["amber", "mint", "mocha", "rose"].flatMap(t => [`${BASE}/workbench-${t}.html`, `${BASE}/workbench-${t}-m.html`]),
  `${SKILL}/workbench-desktop.html`,
  `${SKILL}/workbench-mobile.html`,
];

const OLD = `cfg(){ try { return JSON.parse(storage.getItem(SYNC_KEY)) || {}; } catch(e){ return {}; } },`;
const NEW = `cfg(){ const raw=storage.getItem(SYNC_KEY); if(raw==null) return {url:"${WORKER_URL}", token:"${TOKEN}"}; try { const c=JSON.parse(raw)||{}; if(c.url && /^http:\\/\\//.test(c.url)) c.url="${WORKER_URL}"; return c; } catch(e){ return {}; } },`;

let fail = 0;
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes(OLD)) {
    if (s.includes("workbench-sync.chen529173628.workers.dev")) { console.log("跳过(已接入): " + path.basename(f)); continue; }
    console.error("✗ 未找到锚点: " + f); fail++; continue;
  }
  s = s.replace(OLD, NEW);
  fs.writeFileSync(f, s);
  console.log("✓ 已接入: " + path.basename(f));
}
if (fail) process.exit(1);

// 语法验证：8 个交付页面所有 <script> 块可编译
for (const f of files.slice(0, 8)) {
  const s = fs.readFileSync(f, "utf8");
  [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
  const n = (s.match(new RegExp(WORKER_URL.replace(/\./g, "\\."), "g")) || []).length;
  if (n !== 1) throw new Error(`${path.basename(f)} Worker 地址出现 ${n} 次（应为 1）`);
}
console.log("=== 语法与接入点验证通过 ===");
