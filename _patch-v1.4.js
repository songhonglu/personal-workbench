// _patch-v1.4.js — v1.4：PWA 支持 + 图片真缩略图 + 删除可撤销
//
// 1) PWA：9 个 HTML（8 工作台 + index）注入 manifest/theme-color/apple 元数据 + SW 注册
// 2) 缩略图：上传时同步生成 96px JPEG 缩略图 imageThumb，列表渲染用小图，编辑看大图
// 3) 撤销删除：confirmDelete 由确认弹窗改为直接删除 + toast「撤销」5 秒
// 4) toast 扩展：支持可选 action 按钮（撤销用）

const fs = require('fs');
const path = require('path');
const dir = __dirname;

const PWA_HEAD = `<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#2f7d51">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="工作台">
<link rel="apple-touch-icon" href="icon-192.png">
</head>`;

const SW_REG = `<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>
</body>`;

const OLD_TOAST = `function toast(msg){
  let t=$("#toast"); if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"), 2600);
}`;

const NEW_TOAST = `function toast(msg, action){
  let t=$("#toast"); if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg;
  if(t._btn){ t._btn.remove(); t._btn=null; }
  if(action){ const b=document.createElement("button"); b.className="toast-act"; b.textContent=action.label;
    b.onclick=()=>{ try{action.fn();}catch(e){} t.classList.remove("show"); if(t._btn){ t._btn.remove(); t._btn=null; } };
    t.appendChild(b); t._btn=b; }
  t.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{ t.classList.remove("show"); if(t._btn){ t._btn.remove(); t._btn=null; } }, action?5200:2600);
}`;

const TOAST_CSS = `.toast{display:flex;align-items:center;gap:12px}
  .toast-act{flex:0 0 auto;border:1px solid currentColor;background:transparent;color:inherit;border-radius:8px;padding:3px 12px;font-size:12px;font-weight:700;cursor:pointer}
</style>`;

const OLD_DEL_HEAD = `function confirmDelete(key,id){ const item=(data[key]||[]).find(i=>i.id==id); if(!item) return;
  const overlay=document.createElement("div"); overlay.className="overlay";`;
const OLD_DEL_HEAD_M = `function confirmDelete(key,id){
  const item=(data[key]||[]).find(i=>i.id==id); if(!item) return;
  const overlay=document.createElement("div"); overlay.className="overlay";`;
const OLD_DEL_TAIL = `overlay.querySelector("#c-ok").onclick=()=>{ data[key]=data[key].filter(i=>i.id!=id); persist(); close(); };
}`;
const NEW_DELETE = `function confirmDelete(key,id){
  const list=data[key]||[]; const idx=list.findIndex(i=>i.id==id); if(idx<0) return;
  const item=list[idx];
  list.splice(idx,1); persist();   // 直接删除，toast 内 5 秒可撤销
  toast("已删除「"+String(item.title||'这条记录').slice(0,18)+"」", { label:"撤销", fn:()=>{
    if(!data[key]) data[key]=[];
    if(!data[key].some(i=>i.id==id)){ data[key].splice(Math.min(idx,data[key].length),0,item); persist(); }
  }});
}`;

const RULES = [
  // PWA head
  { name: "PWA head", from: "</head>", to: PWA_HEAD, once: true },
  // SW 注册
  { name: "SW 注册", from: "</body>", to: SW_REG, once: true },
  // toast 扩展
  { name: "toast 扩展", from: OLD_TOAST, to: NEW_TOAST },
  // toast-act CSS
  { name: "toast CSS", from: "</style>", to: TOAST_CSS, once: true },
  // 缩略图：隐藏 input
  { name: "缩略图隐藏input", from: `<input id="f-image" value="\${attr(d.image||'')}" placeholder="或粘贴URL" style="flex:1;min-width:120px"/>`,
    to: `<input id="f-image" value="\${attr(d.image||'')}" placeholder="或粘贴URL" style="flex:1;min-width:120px"/><input type="hidden" id="f-image-thumb" value="\${attr(d.imageThumb||'')}"/>` },
  // 缩略图：ft 变量声明
  { name: "ft 声明", from: `(function(){var ff=overlay.querySelector("#f-image-file"),fi=overlay.querySelector("#f-image"),fp=overlay.querySelector("#f-image-prev");`,
    to: `(function(){var ff=overlay.querySelector("#f-image-file"),fi=overlay.querySelector("#f-image"),fp=overlay.querySelector("#f-image-prev"),ft=overlay.querySelector("#f-image-thumb");` },
  // 缩略图：编辑时带出
  { name: "编辑带出thumb", from: `if(d.image&&fi){fi.value=d.image;fp.src=d.image;`,
    to: `if(d.image&&fi){fi.value=d.image;if(ft)ft.value=d.imageThumb||"";fp.src=d.image;` },
  // 缩略图：上传时生成 96px
  { name: "上传生成thumb", from: `c.getContext("2d").drawImage(img,0,0,w,h);var du=c.toDataURL("image/jpeg",0.7);fi.value=du;`,
    to: `c.getContext("2d").drawImage(img,0,0,w,h);var du=c.toDataURL("image/jpeg",0.7);var s2=Math.min(96/w,96/h,1);var c2=document.createElement("canvas");c2.width=Math.max(1,Math.round(w*s2));c2.height=Math.max(1,Math.round(h*s2));c2.getContext("2d").drawImage(c,0,0,c2.width,c2.height);var tu=c2.toDataURL("image/jpeg",0.6);fi.value=du;if(ft)ft.value=tu;` },
  // 缩略图：URL 手输时清掉旧 thumb
  { name: "URL清thumb", from: `if(fi)fi.oninput=function(){var v=fi.value.trim();`,
    to: `if(fi)fi.oninput=function(){if(ft)ft.value="";var v=fi.value.trim();` },
  // 缩略图：保存
  { name: "保存thumb", from: `d.image=(val("#f-image")||"").trim();`,
    to: `d.image=(val("#f-image")||"").trim();d.imageThumb=(val("#f-image-thumb")||"").trim();if(!d.imageThumb)delete d.imageThumb;` },
  // 列表渲染用缩略图
  { name: "列表用thumb", from: `src="\${attr(x.image)}" alt="" onerror=`,
    to: `src="\${attr(x.imageThumb||x.image)}" alt="" onerror=` },
];

const workbenches = fs.readdirSync(dir).filter(f => /^workbench-.*\.html$/.test(f));
let ok = 0, fail = 0;

/* ---- 8 个工作台文件 ---- */
for (const f of workbenches) {
  const fp = path.join(dir, f);
  let html = fs.readFileSync(fp, 'utf8');
  const log = [];

  if (html.includes('rel="manifest"')) { console.log("⏭ " + f + " 已打过补丁，跳过"); continue; }

  for (const r of RULES) {
    if (html.includes(r.from)) {
      html = html.replace(r.from, r.to);   // v1.4 所有锚点均为单次出现，单次替换（避免 to 包含 from 时死循环）
      log.push("✓ " + r.name);
    } else log.push("✗ " + r.name);
  }

  // confirmDelete 改撤销（桌面/移动锚点不同，尾巴相同）
  if (html.includes(OLD_DEL_HEAD)) html = html.replace(OLD_DEL_HEAD, "@@DELHEAD@@");
  else if (html.includes(OLD_DEL_HEAD_M)) html = html.replace(OLD_DEL_HEAD_M, "@@DELHEAD@@");
  if (html.includes("@@DELHEAD@@")) {
    if (html.includes(OLD_DEL_TAIL)) {
      html = html.replace(/@@DELHEAD@@[\s\S]*?overlay\.querySelector\("#c-ok"\)\.onclick=\(\)=>\{ data\[key\]=data\[key\]\.filter\(i=>i\.id!=id\); persist\(\); close\(\); \};\n\}/, NEW_DELETE);
      log.push(html.includes("已删除「") ? "✓ 撤销删除" : "✗ 撤销删除(正则未命中)");
    } else log.push("✗ 撤销删除(尾部锚点未命中)");
  } else if (!html.includes("已删除「")) log.push("✗ 撤销删除(头部锚点未命中)");
  else log.push("⏭ 撤销删除(已有)");

  const hasFail = log.some(l => l.startsWith("✗"));
  if (hasFail) fail++; else ok++;
  console.log((hasFail ? "⚠️ " : "✅ ") + f);
  log.forEach(l => console.log("   " + l));
  fs.writeFileSync(fp, html, 'utf8');
}

/* ---- index.html：只注入 PWA head + SW ---- */
const idx = path.join(dir, 'index.html');
let ihtml = fs.readFileSync(idx, 'utf8');
if (!ihtml.includes('rel="manifest"')) {
  ihtml = ihtml.replace("</head>", PWA_HEAD).replace("</body>", SW_REG);
  fs.writeFileSync(idx, ihtml, 'utf8');
  console.log("✅ index.html（PWA head + SW 注册）");
} else console.log("⏭ index.html 已打过补丁");

console.log(`\n完成：${ok} 成功 / ${fail} 有未命中项`);
