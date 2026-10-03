#!/usr/bin/env node
/* 验证 cur() 兜底串号问题：在多账号共享 storage 下，切到新账号后 cur() 是否仍指向 Song.Han */
const fs=require("fs"), path=require("path");
const html=fs.readFileSync(path.join(__dirname,"workbench.html"),"utf8");
const tags=html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)||[];
const keep=[0,1,3].map(i=>tags[i].replace(/^<script[^>]*>/,"").replace(/<\/script>$/,""));

function makeStubEl(id){ const el={id:id||"",tagName:"DIV",classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},style:{},value:"",textContent:"",innerHTML:"",onclick:null,onchange:null,oninput:null,appendChild(){},removeChild(){},insertAdjacentHTML(){},setAttribute(){},getAttribute(){return null;},removeAttribute(){},getBoundingClientRect(){return{top:0,left:0,width:0,height:0};},focus(){},blur(){},click(){},querySelector(){return makeStubEl();},querySelectorAll(){return[];},closest(){return null;},matches(){return false;},files:null}; el.addEventListener=()=>{}; el.removeEventListener=()=>{}; return el; }
function makeLS(){ const m=new Map(); return {_map:m,get length(){return this._map.size;},key(i){const k=[...this._map.keys()];return i<k.length?k[i]:null;},getItem(k){return this._map.has(k)?this._map.get(k):null;},setItem(k,v){this._map.set(k,String(v));},removeItem(k){this._map.delete(k);},clear(){this._map.clear();}}; }

const TARGET="usr-muqipi7t94utp9";
const ls=makeLS();
ls.setItem("wb-users", JSON.stringify({"Song.Han":{username:"Song.Han",nickname:"Song.Han",userId:TARGET,passHash:"x",ts:Date.now()}}));
ls.setItem("wb-auth", JSON.stringify({username:"Song.Han",userId:TARGET,nickname:"Song.Han",ts:Date.now()}));

const doc={ documentElement:{getAttribute(){return null;},setAttribute(){},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}}}, body:makeStubEl("body"), createElement(t){return makeStubEl(t);}, createTextNode(t){return{textContent:t};}, querySelector(s){return makeStubEl(s);}, querySelectorAll(){return[];}, getElementById(id){return makeStubEl(id);}, title:"x", head:makeStubEl("head"), cookie:"", visibilityState:"visible", hidden:false, localStorage:ls };
doc.addEventListener=()=>{}; doc.removeEventListener=()=>{};

const nav={userAgent:"t",onLine:false,clipboard:{writeText:async()=>{}},geolocation:undefined,vibrate:undefined,serviceWorker:undefined};
const win={document:doc,localStorage:ls,navigator:nav,location:{href:"x",search:"",hash:"",pathname:"/w.html",protocol:"http:"},innerWidth:1200,innerHeight:800,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){setTimeout(()=>cb(Date.now()),0);},setTimeout:setTimeout.bind(globalThis),clearTimeout:clearTimeout.bind(globalThis),setInterval:setInterval.bind(globalThis),clearInterval:clearInterval.bind(globalThis),performance:{now:()=>Date.now()},history:{state:null,replaceState(){},pushState(){},back(){},forward(){}},atob(s){return Buffer.from(s,"base64").toString("binary");},btoa(s){return Buffer.from(s,"binary").toString("base64");},indexedDB:{open(){return{result:{},onupgradeneeded:null,onerror:null,onsuccess:null};}},fetch(){return Promise.resolve({ok:false,status:503,json:()=>Promise.resolve({})});},crypto:{randomUUID(){return require("crypto").randomUUID();}}};
win.window=win;win.self=win;win.top=win;win.parent=win;win.globalThis=win;
win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
win.requestIdleCallback=cb=>setTimeout(()=>cb({timeRemaining:()=>50}),0);
win.caches=undefined;
win.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},onchange:null});

const src=keep.join("\n;\n")+`;globalThis.__wb={wbUser,wbFriends,store,CONFIG,wbUserSlot,wbUid,wbHash,isoToday,data,ensureV2};return globalThis.__wb;`;
const f=new Function("window","document","navigator","localStorage","fetch","console","globalThis","structuredClone","IntersectionObserver","ResizeObserver","atob","btoa","crypto","location","history","performance","indexedDB","requestIdleCallback","matchMedia","caches",`"use strict";\n`+src);
const api=f(win,doc,nav,ls,win.fetch,{log(){},warn(){},error(){},info(){},debug(){}},win,structuredClone,win.IntersectionObserver,win.ResizeObserver,win.atob,win.btoa,win.crypto,win.location,win.history,win.performance,win.indexedDB,win.requestIdleCallback,win.matchMedia,win.caches);

// 注册一个新账号
const r=api.wbUser.register("zhangwei","周一鸣","wb2026");
console.log("register zhangwei:", r.ok ? "ok userId="+r.rec.userId : "fail "+r.err);
console.log("当前 cur() =", JSON.stringify(api.wbUser.cur()));
console.log("  期望：{userId: usr-xxx(zhangwei 的), nickname 周一鸣}");
console.log("  实际：如果返回 userId=usr-muqipi7t94utp9 (Song.Han) → 串号 bug 坐实");

// 直接读 wb-auth（register 写的是命名空间键）
console.log("wb-auth 键内容 ==", ls.getItem("wb-auth"));
console.log("wb-auth::user::"+r.rec.userId+" ==", ls.getItem("wb-auth::user::"+r.rec.userId));

// 再注册一个
const r2=api.wbUser.register("lisiyuan","李思远","wb2026");
console.log("\nregister lisiyuan:", r2.ok ? "ok userId="+r2.rec.userId : "fail "+r2.err);
console.log("当前 cur() =", JSON.stringify(api.wbUser.cur()));
