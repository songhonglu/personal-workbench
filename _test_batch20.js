#!/usr/bin/env node
/* _test_batch20.js — 批量注册 20 账号并把它们都加 Song.Han 为好友（共享浏览器模型，模拟 v1.19.0）
 * 等价于在真实浏览器 DevTools 里执行 _batch_register_20.js：
 *   - 一个共享 localStorage（= 你当前浏览器里 Song.Han 所在 storage 槽）
 *   - Song.Han 已注册（userId 固定 usr-muqipi7t94utp9）
 *   - 逐个 register 20 个新账号（register 后登录态切到该账号）→ 立即 addFriend Song.Han
 *   - 因 addFriend 双向回写，Song.Han 的好友表（wb-friends::user::{uid}）也会出现全部 20 人
 * 校验：
 *   1) 20 账号全部注册成功
 *   2) 每个新账号的好友表里含 Song.Han
 *   3) Song.Han 的好友表覆盖全部 20 个新账号
 */
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const html=fs.readFileSync(path.join(__dirname,"workbench.html"),"utf8");
const tags=html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)||[];
const keep=[0,1,3].map(i=>tags[i].replace(/^<script[^>]*>/,"").replace(/<\/script>$/,""));

/* ---- fake DOM / localStorage 桩 ---- */
function makeStubEl(id){const el={id:id||"",tagName:"DIV",classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},style:{},value:"",textContent:"",innerHTML:"",onclick:null,onchange:null,oninput:null,appendChild(){},removeChild(){},insertAdjacentHTML(){},setAttribute(){},getAttribute(){return null;},removeAttribute(){},getBoundingClientRect(){return{top:0,left:0,width:0,height:0};},focus(){},blur(){},click(){},querySelector(){return makeStubEl();},querySelectorAll(){return[];},closest(){return null;},matches(){return false;},files:null};el.addEventListener=()=>{};el.removeEventListener=()=>{};return el;}
function makeLocalStorage(initial){const m=new Map(Object.entries(initial||{}));return{_map:m,get length(){return this._map.size;},key(i){const k=[...this._map.keys()];return i<k.length?k[i]:null;},getItem(k){return this._map.has(k)?this._map.get(k):null;},setItem(k,v){this._map.set(k,String(v));},removeItem(k){this._map.delete(k);},clear(){this._map.clear();}};}

const TARGET="usr-muqipi7t94utp9"; // Song.Han
const NAMES=[
  ["周一鸣","zhangwei"],["李思远","lisiyuan"],["王小雨","wangxiaoyu"],
  ["陈雨桐","chenyutong"],["赵启铭","zhaoqiming"],["孙可欣","sunqianxin"],
  ["吴亦辰","wuyichen"],["郑嘉怡","zhengjiayi"],["冯泽楷","fengzekai"],
  ["褚静姝","chujingshu"],["蒋明轩","jiangmingxuan"],["沈雨桐","shenyutong"],
  ["韩沛霖","hanpeilin"],["曹语嫣","caoyuyan"],["邓子睿","dengzuirui"],
  ["许知微","xuzhiwei"],["彭皓宇","penghaoyu"],["萧南乔","xiaonanqiao"],
  ["程晚舟","chengwanzhou"],["苏念卿","sunianqing"],
];

function main(){
  const LOG=[]; const log=(t,m)=>{LOG.push(`[${t}] ${m}`);console.log(`[${t}] ${m}`);};

  /* 预置 Song.Han 已注册（固定 userId） */
  const reg={};
  reg["Song.Han"]={username:"Song.Han",nickname:"Song.Han",userId:TARGET,passHash:"(already-registered)",ts:Date.now()};
  const ls=makeLocalStorage({
    "wb-users":JSON.stringify(reg),
    "wb-auth":JSON.stringify({username:"Song.Han",userId:TARGET,nickname:"Song.Han",ts:Date.now()}),
  });

  const doc={documentElement:{getAttribute(){return null;},setAttribute(){},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}}},
    body:makeStubEl("body"),head:makeStubEl("head"),
    createElement(t){return makeStubEl(t);},createTextNode(t){return{textContent:t};},
    querySelector(s){return makeStubEl(s);},querySelectorAll(){return[];},getElementById(id){return makeStubEl(id);},
    title:"x",cookie:"",visibilityState:"visible",hidden:false,localStorage:ls};
  doc.addEventListener=()=>{};doc.removeEventListener=()=>{};

  const nav={userAgent:"node-batch20",onLine:false,clipboard:{writeText:async()=>{}},geolocation:undefined,vibrate:undefined,serviceWorker:undefined};
  const win={document:doc,localStorage:ls,navigator:nav,
    location:{href:"http://localhost/",search:"",hash:"",pathname:"/workbench.html",protocol:"http:"},
    innerWidth:1280,innerHeight:800,
    addEventListener(){},removeEventListener(){},
    requestAnimationFrame(cb){setTimeout(()=>cb(Date.now()),0);},
    setTimeout:setTimeout.bind(globalThis),clearTimeout:clearTimeout.bind(globalThis),
    setInterval:setInterval.bind(globalThis),clearInterval:clearInterval.bind(globalThis),
    performance:{now:()=>Date.now()},
    history:{state:null,replaceState(){},pushState(){},back(){},forward(){}},
    atob(s){return Buffer.from(s,"base64").toString("binary");},
    btoa(s){return Buffer.from(s,"binary").toString("base64");},
    indexedDB:{open(){return{result:{},onupgradeneeded:null,onerror:null,onsuccess:null};}},
    fetch(){return Promise.resolve({ok:false,status:503,json:()=>Promise.resolve({})});},
    crypto:{randomUUID(){return crypto.randomUUID();}}};
  win.window=win;win.self=win;win.top=win;win.parent=win;win.globalThis=win;
  win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  win.requestIdleCallback=cb=>setTimeout(()=>cb({timeRemaining:()=>50}),0);
  win.caches=undefined;
  win.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},onchange:null});

  const src=keep.join("\n;\n")+`;
    globalThis.__wb={wbUser,wbFriends,store,CONFIG,wbUserSlot,wbUid,wbHash,isoToday,data,ensureV2};
    return globalThis.__wb;
  `;
  const factory=new Function("window","document","navigator","localStorage","fetch","console","globalThis","structuredClone","IntersectionObserver","ResizeObserver","atob","btoa","crypto","location","history","performance","indexedDB","requestIdleCallback","matchMedia","caches",`"use strict";\n`+src);
  const api=factory(win,doc,nav,ls,win.fetch,{log(){},warn(){},error(){},info(){},debug(){}},win,structuredClone,win.IntersectionObserver,win.ResizeObserver,win.atob,win.btoa,win.crypto,win.location,win.history,win.performance,win.indexedDB,win.requestIdleCallback,win.matchMedia,win.caches);

  log("setup","共享浏览器会话已建立，Song.Han ("+TARGET+") 为当前登录账号");

  const results=[]; const issues=[];
  let registered=0,friendOk=0,friendAlready=0,failed=0;

  for(let i=0;i<NAMES.length;i++){
    const [nickname,username]=NAMES[i];
    const tag="#"+(i+1)+" "+username;
    const r=api.wbUser.register(username,nickname,"wb2026");
    if(!r.ok){
      failed++;
      results.push({i:i+1,username,nickname,status:"注册失败："+r.err});
      log(tag,"注册失败："+r.err);
      issues.push(`[${i+1}] ${username} 注册失败：${r.err}`);
      continue;
    }
    registered++;
    /* v1.19.0：register 后 cur() 应指向新账号（不再串号到 Song.Han） */
    const curNow=api.wbUser.cur();
    log(tag,`注册成功 (${r.rec.userId})，cur()=${curNow?curNow.userId:"null"}（期望 ${r.rec.userId}）`);
    const f=api.wbFriends.addFriend({userId:TARGET,nickname:"Song.Han"});
    if(f.ok){friendOk++;results.push({i:i+1,username,nickname,userId:r.rec.userId,status:"注册成功，已加 Song.Han 好友"});log(tag,"已加 Song.Han 好友");}
    else if(f.err==="已是好友"){friendAlready++;results.push({i:i+1,username,nickname,userId:r.rec.userId,status:"注册成功，已是好友"});log(tag,"已是好友");}
    else{failed++;results.push({i:i+1,username,nickname,userId:r.rec.userId,status:"注册成功，加好友失败："+f.err});issues.push(`[${i+1}] ${username} 加好友失败：${f.err}`);log(tag,"加好友失败："+f.err);}
  }

  /* 切回 Song.Han 视角 */
  const sw=api.wbUser.switchTo(TARGET);
  log("songhan",sw?"已切回 Song.Han 视角":"切回 Song.Han 失败");
  const friends=api.wbFriends.list();
  const friendUids=new Set(friends.map(x=>x.userId));
  const newUids=results.filter(x=>x.userId).map(x=>x.userId);
  const missing=newUids.filter(uid=>!friendUids.has(uid));
  log("songhan","Song.Han 好友表共 "+friends.length+" 人，覆盖新账号 "+(newUids.length-missing.length)+"/"+newUids.length);

  /* 双向校验：每个新账号的好友表里含 Song.Han（键口径与 addFriend 回写一致） */
  let backRefs=0;
  for(const x of results){
    if(!x.userId)continue;
    const selfFKey="wb-friends::user::"+x.userId;
    const raw=ls.getItem(selfFKey);
    if(raw){const map=JSON.parse(raw);if(map[TARGET])backRefs++;}
  }
  log("verify","新账号好友表回写 Song.Han："+backRefs+"/"+newUids.length);

  console.log("\n========== 汇总 ==========");
  results.forEach(x=>console.log(`#${x.i} ${x.username} ${x.nickname||""} → ${x.status}`));
  console.log(`注册成功 ${registered} / 加好友成功 ${friendOk} / 已是好友 ${friendAlready} / 失败 ${failed}`);
  console.log(`Song.Han 好友表 ${friends.length} 人（含 20 新账号：${missing.length===0?"是 ✅":"否 ❌ 缺 "+missing.length}）`);
  console.log(`新账号好友表回写 Song.Han：${backRefs}/${newUids.length}`);

  if(missing.length)issues.push("Song.Han 好友表缺失 "+missing.length+" 人："+missing.join(","));
  if(backRefs!==newUids.length)issues.push(`${newUids.length-backRefs} 个新账号好友表未回写 Song.Han`);

  console.log("\n========== 过程中遇到的问题 ==========");
  if(issues.length)issues.forEach(s=>console.log("• "+s));
  else console.log("（本次过程未发现问题）");

  /* 生成可粘贴到真实浏览器控制台的等价脚本 */
  const snippet=`// 批量注册 20 账号并把它们都加 Song.Han 为好友
// 在 workbench.html 页面的 DevTools Console 粘贴执行（真实作用在你当前浏览器的 localStorage）
(function(){
  var TARGET_UID="${TARGET}", TARGET_NAME="Song.Han";
  var NAMES=${JSON.stringify(NAMES)};
  var PWD="wb2026";
  var ok=0, already=0, fail=0, res=[];
  NAMES.forEach(function(pair,i){
    var username=pair[1], nickname=pair[0];
    var r=wbUser.register(username,nickname,PWD);
    if(!r.ok){fail++;res.push("#"+(i+1)+" "+username+" 注册失败："+r.err);return;}
    ok++;
    var f=wbFriends.addFriend({userId:TARGET_UID,nickname:TARGET_NAME});
    if(f.ok){res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，已加 Song.Han 好友");}
    else if(f.err==="已是好友"){already++;res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，已是好友");}
    else{fail++;res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，加好友失败："+f.err);}
  });
  // 直接读 Song.Han 的好友表键（addFriend 回写口径），不受 switchTo 影响
  var friendKey="wb-friends::user::"+TARGET_UID;
  var raw=null, map={};
  try{ raw=localStorage.getItem(friendKey); if(raw) map=JSON.parse(raw); }catch(e){}
  console.log("========== 批量注册结果 ==========");
  res.forEach(function(x){console.log(x);});
  console.log("注册成功 "+ok+" / 已是好友 "+already+" / 失败 "+fail);
  console.log("Song.Han 好友表共 "+Object.keys(map).length+" 人（应包含全部 20 新账号）");
  wbUser.switchTo(TARGET_UID);
  if(typeof render==="function")render();
  return {ok:ok, already:already, failed:fail, songhanFriends:Object.keys(map).length};
})();
`;
  fs.writeFileSync(path.join(__dirname,"_batch_register_20_console.js"),snippet,"utf8");
  log("output","已生成浏览器控制台可粘贴版本：_batch_register_20_console.js");

  process.exit(0);
}

main();
