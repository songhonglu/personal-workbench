// Smoke test harness for workbench.html (numeric habit feature)
const fs = require("fs"), vm = require("vm");

function makeEl(tag){
  const el = {
    tagName:(tag||"div").toUpperCase(), _children:[], dataset:{}, attributes:{},
    className:"", textContent:"", value:"", innerHTML:"", _on:{},
    style:new Proxy({}, { set:(t,k,v)=>{t[k]=v;return true;}, get:(t,k)=>Object.prototype.hasOwnProperty.call(t,k)?t[k]:"" }),
    classList:{ _s:new Set(), add:(...c)=>c.forEach(x=>el.classList._s.add(x)),
      remove:(...c)=>c.forEach(x=>el.classList._s.delete(x)),
      toggle:(c,f)=>{ if(f===undefined){ el.classList._s.has(c)?el.classList._s.delete(c):el.classList._s.add(c);} else { f?el.classList._s.add(c):el.classList._s.delete(c);} },
      contains:(c)=>el.classList._s.has(c) },
    setAttribute(k,v){this.attributes[k]=String(v);}, getAttribute(k){return this.attributes[k];},
    removeAttribute(k){delete this.attributes[k];}, appendChild(c){this._children.push(c);return c;},
    removeChild(c){return c;}, remove(){}, addEventListener(t,f){this._on[t]=f;}, removeEventListener(){},
    querySelector(){return null;}, querySelectorAll(){return [];}, closest(){return null;},
    getBoundingClientRect(){return {width:0,height:0,top:0,left:0};}, focus(){}, blur(){},
    insertAdjacentHTML(){}, contains(){return false;}, scrollIntoView(){}, scrollTo(){}, getContext(){return null;},
  };
  return el;
}
const _qcache={};
const document = {
  body:makeEl("body"), documentElement:makeEl("html"), head:makeEl("head"),
  createElement:(t)=>makeEl(t),
  querySelector:(s)=>_qcache[s]||(_qcache[s]=makeEl("div")),
  querySelectorAll:()=>[],
  getElementById:(s)=>_qcache[s]||(_qcache[s]=makeEl("div")),
  addEventListener:()=>{}, removeEventListener:()=>{},
  readyState:"complete", hidden:false, createTextNode:()=>makeEl("#text"), title:"",
};
const _ls={};
const localStorage={ getItem:k=>(k in _ls?_ls[k]:null), setItem:(k,v)=>{_ls[k]=String(v);}, removeItem:k=>{delete _ls[k];}, clear:()=>{for(const k in _ls)delete _ls[k];} };

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, String, Number, parseInt, parseFloat,
  structuredClone:(o)=>JSON.parse(JSON.stringify(o)),
  document, localStorage, location:{pathname:"/workbench.html"},
  navigator:{onLine:true, serviceWorker:{addEventListener(){},register(){return Promise.resolve();}}},
  fetch:()=>Promise.reject(new Error("no net in test")),
  requestAnimationFrame:()=>0, cancelAnimationFrame(){}, addEventListener(){}, removeEventListener(){},
  alert(){}, confirm(){return false;}, prompt(){return null;},
  Image:function(){return {set src(v){this._s=v;}, onload:null, onerror:null, width:0, height:0};},
  FileReader:function(){return {readAsDataURL(){},onload:null,result:null};},
  Blob:function(){}, File:function(){}, URL:{createObjectURL:()=>"", revokeObjectURL(){}},
  innerWidth:1280, innerHeight:800, scrollTo(){},
  matchMedia:()=>({matches:false, addEventListener(){}, removeEventListener(){}}),
  IntersectionObserver:function(){return {observe(){},unobserve(){},disconnect(){}};},
  MutationObserver:function(){return {observe(){},disconnect(){}};},
};
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;

const html = fs.readFileSync("workbench.html","utf8");
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, main=""; while((m=re.exec(html))){ if(m[1].length>main.length) main=m[1]; }

vm.createContext(sandbox);
vm.runInContext(main, sandbox, {filename:"workbench-main.js"});

const checks = vm.runInContext(`(() => {
  const out = [];
  const ck = modOf("checkin");
  const ok = (name, cond) => out.push((cond?"PASS":"FAIL") + " :: " + name);
  const numeric = recHTML(ck, {id:1, title:"喝水", goal:8, unit:"杯", log:{}});
  const boolean = recHTML(ck, {id:2, title:"早起", log:{}});
  ok("numeric renders step +", /js-hinc/.test(numeric));
  ok("numeric renders step -", /js-hdec/.test(numeric));
  ok("numeric shows target /8 杯", new RegExp("\\/ 8 杯").test(numeric));
  ok("numeric has progress bar", /pbar/.test(numeric));
  ok("numeric has NO plain checkbox", !/js-chk/.test(numeric));
  ok("boolean renders checkbox", /js-chk/.test(boolean));
  ok("boolean has NO stepper", !/js-hinc/.test(boolean));
  const item = newItem(ck);
  ok("newItem checkin has no goal by default", item.goal === undefined);
  ok("streak({}) = 0", streak({}) === 0);
  ok("modules include checkin", !!ck);

  // —— 记账增强 转账类型 ——
  const fm = modOf("money");
  const trf = recHTML(fm, {id:9, title:"工资卡→余额宝", type:"transfer", amount:500, category:"转账", date:"2026-09-30"});
  const inc = recHTML(fm, {id:10, title:"稿费", type:"income", amount:800, category:"其他", date:"2026-09-30"});
  const exp = recHTML(fm, {id:11, title:"午餐", type:"expense", amount:25, category:"餐饮", date:"2026-09-30"});
  ok("transfer renders 转账 badge", /⇄ 转账/.test(trf));
  ok("transfer renders neutral amt.trf", /amt trf/.test(trf));
  ok("transfer has no + or - sign", new RegExp("⇄¥500").test(trf) && !new RegExp("[+\\u2212\\u2013\\u2014-]¥").test(trf));
  ok("income renders amt.inc +", inc.includes("amt inc") && inc.includes("+¥800"));
  ok("expense renders amt.exp -", /amt exp/.test(exp));
  ok("money categories include 转账", (fm.categories||[]).includes("转账"));
  const finItem = newItem(fm);
  ok("newItem finance is expense", finItem.type === "expense");
  return out.join("\\n");
})()`, sandbox);
console.log(checks);
let all = checks;

// Node-side source-marker checks (features that need DOM wiring)
const markers = [
  ["finance dup button", "btn-dup"],
  ["finance dup handler", "复刻上一条"],
  ["todo batch button", "btn-batch"],
  ["todo batch bar", "batch-bar"],
  ["todo batch checkbox", "js-bsel"],
  ["finance batch button", "btn-fbatch"],
  ["finance batch bar", "fbsel-del"],
  ["finance batch checkbox", "js-fsel"],
  ["CSV export transfer type", "转账"],
  ["CSV export recur field", "每周"],
  ["mobile kb-open handler", "kb-open"],
  ["mobile visualViewport", "visualViewport"],
  ["note→todo button", "md-todo"],
  ["reminder mute button", "btn-mute"],
  ["reminder mute menu", "openMuteMenu"],
  ["reminder mute guard", "remMuted"],
  ["focus-visible polish", ":focus-visible"],
];
const srcLines = markers.map(([name, token]) =>
  (html.includes(token) ? "PASS" : "FAIL") + " :: " + name + " («" + token + "»)");
console.log(srcLines.join("\n"));
process.exit((/FAIL/.test(checks) || srcLines.some(l => /FAIL/.test(l))) ? 1 : 0);