// Cloudflare Pages — Advanced Mode _worker.js  (v3.0 多用户 · 按用户隔离)
// 路由：
//   POST /api/users/register   { username, nickname } → { userId, username, nickname, token, existed }
//   GET  /api/users/search?q=  → { users: [ {userId,username,nickname} ] }
//   GET/PUT /data             （Authorization: Bearer {userToken}）→ 按 userId 独立桶
//   POST /api/friends/{uid}/(send|inbox|add|remove|markread)
//   /remind/*                 （兼容旧 ?token= 单密钥，仅 Song.Han 个人提醒）
//   其他 → 静态资源
//
// 安全模型：
//   • 每个注册用户拥有专属 Bearer token（crypto 随机），服务端 KV 存 tokenIndex
//   • 一个 token 只能访问该 userId 名下的 /data 桶与收件箱
//   • 全局用户目录 /api/users/* 公开（用于"找到别人"），但不含 token
//   • 兼容旧 /data?token={TOKEN}（Song.Han 个人桶，保持原单密钥行为）
const TOKEN = "wb-12140654b07374a41aebecae";   // 旧单密钥（仅 Song.Han 个人桶，勿用于新用户）

/* ---------- 工具 ---------- */
const rjson = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
  },
});
function newUserId() { return "usr-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16); }
function newUserToken() { return "wb-u-" + crypto.randomUUID().replace(/-/g, ""); }

/* ---------- v2.0 提醒触达（兼容旧版） ---------- */
const HOLIDAY_2026_OFF = {
  "01-01":"元旦","01-02":"元旦","01-03":"元旦",
  "02-15":"春节","02-16":"春节","02-17":"春节","02-18":"春节","02-19":"春节","02-20":"春节","02-21":"春节","02-22":"春节","02-23":"春节",
  "04-04":"清明","04-05":"清明","04-06":"清明",
  "05-01":"劳动节","05-02":"劳动节","05-03":"劳动节","05-04":"劳动节","05-05":"劳动节",
  "06-19":"端午","06-20":"端午","06-21":"端午",
  "09-25":"中秋","09-26":"中秋","09-27":"中秋",
  "10-01":"国庆","10-02":"国庆","10-03":"国庆","10-04":"国庆","10-05":"国庆","10-06":"国庆","10-07":"国庆",
};
const HOLIDAY_2026_WORK = {
  "01-04":"元旦调休","02-14":"春节调休","02-28":"春节调休","05-09":"劳动节调休","09-20":"国庆调休","10-10":"国庆调休",
};
function cnNow(){ return new Date(Date.now() + 8*3600*1000); }
function cnDate(d){ d=d||cnNow(); return d.toISOString().slice(0,10); }
function daysTo(md){
  const now=cnNow();
  const today0=new Date(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  let t=new Date(now.getUTCFullYear(),+md.slice(0,2)-1,+md.slice(3,5));
  if(t<today0) t=new Date(now.getUTCFullYear()+1,+md.slice(0,2)-1,+md.slice(3,5));
  return Math.round((t-today0)/86400000);
}
async function sendEmail(cfg,subject,text,env){
  if(!cfg.email) return {channel:"email",skipped:"未配置邮箱"};
  if(!env.RESEND_KEY) return {channel:"email",skipped:"未配置 RESEND_KEY"};
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:env.MAIL_FROM||"个人工作台 <onboarding@resend.dev>",to:[cfg.email],subject,html:"<p>"+text.replace(/\n/g,"<br>")+"</p>",text})});
  return r.ok?{channel:"email",sent:true}:{channel:"email",error:"HTTP "+r.status+" "+(await r.text()).slice(0,200)};
}
async function sendWechat(cfg,title,text){
  if(!cfg.wechat) return {channel:"wechat",skipped:"未配置 Server酱 SendKey"};
  const r=await fetch("https://sctapi.ftqq.com/"+encodeURIComponent(cfg.wechat)+".send",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({title,desp:text}).toString()});
  const j=await r.json().catch(()=> ({}));
  return (r.ok&&j.code===0)?{channel:"wechat",sent:true}:{channel:"wechat",error:"code="+(j.code??r.status)};
}
async function sendSms(cfg,payload){
  if(!cfg.sms) return {channel:"sms",skipped:"未配置短信 webhook"};
  const r=await fetch(cfg.sms,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  return r.ok?{channel:"sms",sent:true}:{channel:"sms",error:"HTTP "+r.status};
}
function buildTodayItems(data,cfg){
  const items=[];
  const dstr=cnDate();
  const md=dstr.slice(5);
  const list=(data&&Array.isArray(data.remind))?data.remind:[];
  const ahead=+(cfg.advance||0);
  for(const it of list){
    if(!it||it.enabled===false||it.done) continue;
    if(it.type==="birthday"||it.type==="anniv"){
      const imd=String(it.date||"").slice(5);
      if(imd.length!==5) continue;
      const diff=daysTo(imd);
      if(diff===0) items.push({key:"d-"+it.id+"-"+dstr,title:it.title||"纪念日",text:it.type==="birthday"?"今天是生日，祝生日快乐！🎂":"「"+(it.title||"纪念日")+"」纪念日 ❤️"});
      else if(ahead>0&&diff===ahead) items.push({key:"d-"+it.id+"-"+dstr+"-a",title:"「"+(it.title||"纪念日")+"」还有 "+ahead+" 天就到了",text:"「"+(it.title||"纪念日")+"」还有 "+ahead+" 天就到了，记得准备。"});
    }
  }
  const holOff=HOLIDAY_2026_OFF[md],holWork=HOLIDAY_2026_WORK[md];
  if(holOff) items.push({key:"h-"+dstr,title:holOff+"假期",text:"今天是"+holOff+"假期，放假啦，好好休息 🎉"});
  else if(holWork) items.push({key:"h-"+dstr,title:holWork,text:"今天是"+holWork+"，记得上班 ☕"});
  return items;
}
async function getSentSet(KV,dstr){ try{ return new Set(JSON.parse((await KV.get("remind:sent:"+dstr))||"[]")); }catch{ return new Set(); } }
async function saveSentSet(KV,dstr,set){ await KV.put("remind:sent:"+dstr,JSON.stringify([...set]),{expirationTtl:172800}); }
async function remindHandler(request,env,KV){
  const url=new URL(request.url);
  const seg=url.pathname.replace(/^\/remind\//,"").split("/")[0]||"config";
  if(request.method==="GET"&&seg==="config"){
    const raw=await KV.get("remind:config");
    return rjson({config:raw?JSON.parse(raw):{enabled:false,email:"",wechat:"",sms:"",advance:0}});
  }
  if(request.method==="PUT"&&seg==="config"){
    let body; try{ body=await request.json(); }catch{ return rjson({error:"bad json"},400); }
    const config={enabled:!!body.enabled,email:String(body.email||"").slice(0,120),wechat:String(body.wechat||"").slice(0,80),sms:String(body.sms||"").slice(0,300),advance:[0,1,3].includes(+body.advance)?+body.advance:0,updatedAt:new Date().toISOString()};
    await KV.put("remind:config",JSON.stringify(config));
    return rjson({ok:true,config});
  }
  if(request.method==="GET"&&(seg==="tick"||seg==="test")){
    const cfgRaw=await KV.get("remind:config");
    const cfg=cfgRaw?JSON.parse(cfgRaw):{};
    if(!cfg.enabled) return rjson({ok:true,skipped:"云端推送未启用"});
    if(seg==="test"){
      const title="工作台测试推送";
      const text="这是一封测试推送（"+cnDate()+" UTC+8）。\n配置正常的话，邮箱 / 微信会收到本条消息。";
      const rs=await Promise.allSettled([sendEmail(cfg,title,text,env),sendWechat(cfg,title,text),sendSms(cfg,{title,content:text,date:cnDate()})]);
      return rjson({ok:true,results:rs.map(r=>r.value||{error:String(r.reason)})});
    }
    const stRaw=await KV.get("state");
    let data=null;
    try{ data=(JSON.parse(stRaw||"{}")||{}).data||null; }catch{ data=null; }
    if(!data) return rjson({ok:true,skipped:"暂无同步数据"});
    const items=buildTodayItems(data,cfg);
    if(!items.length) return rjson({ok:true,date:cnDate(),sent:[]});
    const sent=await getSentSet(KV,cnDate());
    const pending=items.filter(i=>!sent.has(i.key));
    if(!pending.length) return rjson({ok:true,date:cnDate(),sent:[],dedup:items.length});
    const profile=data.profile||{};
    const results=[];
    for(const it of pending){
      const text=it.text+"\n\n—— 来自个人工作台云端提醒"+(profile.nickname?"（"+profile.nickname+"）":"");
      const rs=await Promise.allSettled([sendEmail(cfg,"【工作台提醒】"+it.title,text,env),sendWechat(cfg,it.title,text),sendSms(cfg,{title:it.title,content:text,date:cnDate()})]);
      results.push(...rs.map(r=>r.value||{error:String(r.reason)}));
      sent.add(it.key);
    }
    await saveSentSet(KV,cnDate(),sent);
    return rjson({ok:true,date:cnDate(),sentCount:pending.length,results});
  }
  return rjson({error:"not found"},404);
}

/* ---------- 用户目录（v3.0） ---------- */
async function userDir(KV){
  const raw=await KV.get("users");
  try{ return JSON.parse(raw||"null")||{ dir:{}, users:{}, tokenIndex:{}, inboxes:{}, friends:{}, data:{"__default__":null} }; }
  catch{ return { dir:{}, users:{}, tokenIndex:{}, inboxes:{}, friends:{}, data:{"__default__":null} }; }
}
async function saveDir(KV,d){ await KV.put("users",JSON.stringify(d)); }

/* Bearer 解析身份 */
function identify(req, dir, tokenQ){
  const h=req.headers.get("authorization");
  const bearer=h&&h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if(bearer){ const uid=dir.tokenIndex[bearer]; if(uid) return {role:"user",userId:uid,token:bearer}; return null; }
  if(tokenQ){
    if(tokenQ===TOKEN) return {role:"legacy",userId:"__default__",token:tokenQ};   // 旧单密钥兼容 Song.Han
    const uid=dir.tokenIndex[tokenQ]; if(uid) return {role:"user",userId:uid,token:tokenQ};
    return null;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    const cors={
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type, Authorization",
    };
    if(request.method==="OPTIONS") return new Response(null,{headers:cors});

    /* ---------- 用户目录（公开，无需鉴权） ---------- */
    if(url.pathname==="/api/users/register"&&request.method==="POST"){
      const KV=env.KV; if(!KV) return new Response(JSON.stringify({error:"KV not bound"}),{status:500,headers:cors});
      let j; try{ j=await request.json(); }catch{ return rjson({error:"bad json"},400); }
      const username=String((j&&j.username)||"").trim();
      const nickname=String((j&&j.nickname)||username||"").trim();
      if(!username||username.length>24) return rjson({error:"username 1-24 字符"},400);
      const d=await userDir(KV);
      const existing=d.dir[username];
      if(existing){
        const rec=d.users[existing.userId];
        const tokenQ=url.searchParams.get("token");
        const ident=identify(request,d,tokenQ);
        const isSelf=ident&&(ident.role==="legacy"?ident.userId===existing.userId:ident.userId===existing.userId);
        return rjson({userId:existing.userId,username,nickname:rec?rec.nickname:nickname,token:isSelf?rec.token:null,existed:true});
      }
      const userId=newUserId();
      const token=newUserToken();
      d.users[userId]={userId,username,nickname,token,createdAt:Date.now()};
      d.tokenIndex[token]=userId;
      d.dir[username]={userId,username,nickname};
      await saveDir(KV,d);
      return rjson({userId,username,nickname,token,existed:false});
    }
    if(url.pathname==="/api/users/search"&&request.method==="GET"){
      const KV=env.KV; if(!KV) return new Response(JSON.stringify({error:"KV not bound"}),{status:500,headers:cors});
      const q=String(url.searchParams.get("q")||"").toLowerCase().trim();
      const d=await userDir(KV);
      const list=Object.values(d.dir);
      const out=q?list.filter(x=>x.username.toLowerCase().includes(q)||x.nickname.toLowerCase().includes(q)):list;
      return rjson({users:out.map(x=>({userId:x.userId,username:x.username,nickname:x.nickname}))});
    }

    /* ---------- /data 按用户隔离 ---------- */
    if(url.pathname==="/data"){
      const KV=env.KV; if(!KV) return new Response(JSON.stringify({error:"KV not bound"}),{status:500,headers:cors});
      const tokenQ=url.searchParams.get("token");
      const d=await userDir(KV);
      const ident=identify(request,d,tokenQ);
      if(!ident) return new Response(JSON.stringify({error:"auth required"}),{status:401,headers:cors});
      const uid=ident.userId;
      if(!d.data) d.data={};
      if(!d.data[uid]) d.data[uid]={data:null,rev:0,updatedAt:null};
      const bucket=d.data[uid];
      if(request.method==="GET") return rjson({data:bucket.data,rev:bucket.rev,updatedAt:bucket.updatedAt});
      if(request.method==="PUT"){
        let body; try{ body=await request.json(); }catch{ return rjson({error:"bad json"},400); }
        if(!body||typeof body.data!=="object"||body.data===null) return rjson({error:"missing data"},400);
        bucket.data=body.data; bucket.rev=(bucket.rev||0)+1; bucket.updatedAt=new Date().toISOString();
        await saveDir(KV,d);
        return rjson({ok:true,rev:bucket.rev,updatedAt:bucket.updatedAt});
      }
      return new Response("method not allowed",{status:405,headers:cors});
    }

    /* ---------- 好友 + 收件箱（严格鉴权） ---------- */
    const m=url.pathname.match(/^\/api\/friends\/([^/]+)\/(send|inbox|add|remove|markread)$/);
    if(m){
      const KV=env.KV; if(!KV) return new Response(JSON.stringify({error:"KV not bound"}),{status:500,headers:cors});
      const tokenQ=url.searchParams.get("token");
      const d=await userDir(KV);
      const ident=identify(request,d,tokenQ);
      if(!ident) return new Response(JSON.stringify({error:"auth required"}),{status:401,headers:cors});
      const uid=decodeURIComponent(m[1]);
      const action=m[2];

      if(action==="inbox"){
        if(ident.role!=="legacy"&&ident.userId!==uid) return new Response(JSON.stringify({error:"not your inbox"}),{status:403,headers:cors});
        const list=d.inboxes[uid]||[];
        return rjson({inbox:list});
      }
      if(action==="send"){
        let j; try{ j=await request.json(); }catch{ return rjson({error:"bad json"},400); }
        const msg=j&&j.msg;
        if(!msg||!msg.from||!msg.to||!msg.payload) return rjson({error:"bad msg (need from/to/payload)"},400);
        const actor=ident.role==="legacy"?msg.from:ident.userId;
        if(actor!==msg.from) return rjson({error:"from 与调用者身份不符"},400);
        if(!d.inboxes[msg.to]) d.inboxes[msg.to]=[];
        d.inboxes[msg.to].unshift({id:msg.id||("m-"+Date.now()),from:msg.from,fromName:msg.fromName||"",type:msg.type||"todo",payload:msg.payload,text:msg.text||"",sentAt:msg.sentAt||Date.now(),read:false});
        await saveDir(KV,d);
        return rjson({ok:true});
      }
      if(action==="add"){
        let j; try{ j=await request.json(); }catch{ return rjson({error:"bad json"},400); }
        const f=j&&j.friend;
        if(!f||!f.userId) return rjson({error:"need friend.userId"},400);
        const actor=ident.role==="legacy"?uid:ident.userId;
        if(!d.friends[actor]) d.friends[actor]=[];
        if(!d.friends[f.userId]) d.friends[f.userId]=[];
        if(!d.friends[actor].includes(f.userId)) d.friends[actor].push(f.userId);
        if(!d.friends[f.userId].includes(actor)) d.friends[f.userId].push(actor);
        await saveDir(KV,d);
        return rjson({ok:true});
      }
      if(action==="remove"){
        let j; try{ j=await request.json(); }catch{ return rjson({error:"bad json"},400); }
        const target=j&&j.friend;
        if(!target||!target.userId) return rjson({error:"need friend.userId"},400);
        const actor=ident.role==="legacy"?uid:ident.userId;
        if(d.friends[actor]) d.friends[actor]=d.friends[actor].filter(x=>x!==target.userId);
        if(d.friends[target.userId]) d.friends[target.userId]=d.friends[target.userId].filter(x=>x!==actor);
        await saveDir(KV,d);
        return rjson({ok:true});
      }
      if(action==="markread"){
        if(ident.role!=="legacy"&&ident.userId!==uid) return new Response(JSON.stringify({error:"not your inbox"}),{status:403,headers:cors});
        let j; try{ j=await request.json(); }catch{ return rjson({error:"bad json"},400); }
        const msgId=j&&j.msgId;
        if(!msgId) return rjson({error:"need msgId"},400);
        const list=d.inboxes[uid]||[];
        const m2=list.find(x=>x.id===msgId);
        if(m2) m2.read=true;
        await saveDir(KV,d);
        return rjson({ok:true});
      }
    }

    /* ---------- 旧版 /remind 提醒（仅 Song.Han 单密钥兼容） ---------- */
    if(url.pathname==="/remind"||url.pathname.startsWith("/remind/")){
      const KV=env.KV; if(!KV) return new Response(JSON.stringify({error:"KV not bound"}),{status:500,headers:cors});
      if(url.searchParams.get("token")!==TOKEN) return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:cors});
      return remindHandler(request,env,KV);
    }

    /* 其他 → 静态资源 */
    return env.ASSETS.fetch(request);
  },
};
