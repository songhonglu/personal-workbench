#!/usr/bin/env node
/* 诊断：只执行 block0（主逻辑），定位 app 加载失败原因 */
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "workbench.html"), "utf8");
const _scriptTags = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g) || [];
const _keepIdx = [0, 1, 3];

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
function makeElement(tag){
  const el = { tagName: (tag||"div").toUpperCase() };
  Object.assign(el, makeStubEl("x"));
  el.children = [];
  el.style = {}; el.id = ""; el.className = "";
  return el;
}
function makeLocalStorage(initial){
  let map = new Map(Object.entries(initial||{}));
  return {
    _map: map,
    get length(){ return this._map.size; },
    key(i){ const ks=[...this._map.keys()]; return i<ks.length?ks[i]:null; },
    getItem(k){ return this._map.has(k)?this._map.get(k):null; },
    setItem(k,v){ this._map.set(k, String(v)); },
    removeItem(k){ this._map.delete(k); },
    clear(){ this._map.clear(); },
  };
}
function makeDocument(localStorage){
  const root = makeElement("html");
  const body = makeElement("body");
  root.ownerDocument = root;
  const doc = {
    documentElement: root, body,
    createElement(tag){ return makeElement(tag); },
    createTextNode(t){ return { textContent: t }; },
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

function runBlock(idx){
  const ls = makeLocalStorage({});
  const doc = makeDocument(ls);
  const navigatorStub = {
    userAgent: "node-test", onLine: false,
    clipboard: { writeText: async () => {} },
    geolocation: undefined, vibrate: undefined, serviceWorker: undefined,
  };
  const win = {
    document: doc, localStorage: ls, navigator: navigatorStub,
    location: { href: "http://localhost/", search: "", hash: "", pathname: "/workbench.html", protocol: "http:" },
    innerWidth: 1280, innerHeight: 800, visualViewport: undefined,
    matchMedia(){ return { matches: false, addEventListener(){}, removeEventListener(){}, media: "" }; },
    requestAnimationFrame(cb){ try { cb(Date.now()); } catch(_e){} return 0; },
    cancelAnimationFrame(){},
    setTimeout, clearTimeout, setInterval, clearInterval,
    scrollTo(){},
    AudioContext: undefined, webkitAudioContext: undefined,
    IntersectionObserver: undefined, ResizeObserver: undefined, caches: undefined,
    addEventListener(){}, removeEventListener(){}, open(){},
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  doc.defaultView = win;
  win.document = doc;
  doc.documentElement.style = {};
  doc.body.style = {};
  const fetchStub = async (url, opts) => ({ ok: true, status: 200, json: async () => ({}) });

  const b = _scriptTags[idx].replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  const glue = "\n;__wbApi.wbUser=wbUser;__wbApi.wbFriends=wbFriends;__wbApi.store=store;__wbApi.CONFIG=CONFIG;__wbApi.ensureV2=ensureV2;__wbApi.wbUid=wbUid;__wbApi.wbHash=wbHash;__wbApi.isoToday=isoToday;__wbApi.daysAgo=daysAgo;__wbApi.data=data;__wbApi.view=view;__wbApi.sync=sync;";
  let api;
  try {
    api = new Function("document","window","localStorage","fetch","matchMedia","requestAnimationFrame","__wbApi",
      b + glue)(doc, win, ls, fetchStub, win.matchMedia.bind(win), win.requestAnimationFrame.bind(win), {});
    return { ok: true, api, ls };
  } catch(e){
    return { ok: false, err: e, ls };
  }
}

for(const idx of _keepIdx){
  const r = runBlock(idx);
  if(r.ok){
    console.log("block", idx, "OK  api keys:", r.api && Object.keys(r.api));
  } else {
    console.log("block", idx, "FAIL:", r.err.message);
    console.log((r.err.stack||"").slice(0, 2000));
  }
}
