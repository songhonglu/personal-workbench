// v1.1 patch: 全局搜索 + 天气 + 待办归档
// 用法: node _patch-v1.1.js
const fs = require('fs');
const path = require('path');

const CSS = `
  /* ===== v1.1: 全局搜索 + 天气 + 归档 ===== */
  .wb-topbar{display:flex;align-items:center;gap:12px;padding:8px 20px;background:var(--surface-glass);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:20;min-width:0}
  .wb-search{flex:1;max-width:420px;position:relative}
  .wb-search input{width:100%;padding:7px 12px 7px 34px;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text);font-size:13px;outline:none;transition:border-color .2s}
  .wb-search input:focus{border-color:var(--accent)}
  .wb-search .wb-sicon{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);display:flex}
  .wb-sr-dd{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:380px;overflow-y:auto;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow-overlay);z-index:50;display:none}
  .wb-sr-dd.show{display:block}
  .wb-sr-grp-ttl{padding:6px 12px 2px;font-size:11px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
  .wb-sr-item{padding:7px 12px;cursor:pointer;display:flex;align-items:center;gap:8px}
  .wb-sr-item:hover{background:var(--accent-muted)}
  .wb-sr-item .wb-sr-t{font-size:13px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wb-sr-item .wb-sr-m{font-size:11px;color:var(--text-tertiary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wb-weather{display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 10px;border-radius:var(--radius-control);transition:background .2s;position:relative;flex-shrink:0}
  .wb-weather:hover{background:var(--accent-muted)}
  .wb-w-ico{font-size:18px;line-height:1}
  .wb-w-t{font-size:14px;font-weight:600;color:var(--text)}
  .wb-w-c{font-size:11px;color:var(--text-secondary)}
  .wb-w-panel{position:absolute;top:calc(100% + 6px);right:0;width:280px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow-overlay);z-index:50;padding:14px;display:none}
  .wb-w-panel.show{display:block}
  .wb-w-panel input{width:100%;padding:7px 10px;border:1px solid var(--border-input);border-radius:6px;background:var(--surface-nested);color:var(--text);font-size:13px;outline:none;margin-bottom:6px}
  .wb-w-panel input:focus{border-color:var(--accent)}
  .wb-w-res{max-height:180px;overflow-y:auto}
  .wb-w-ci{padding:7px 10px;cursor:pointer;border-radius:6px;font-size:13px;color:var(--text)}
  .wb-w-ci:hover{background:var(--accent-muted)}
  .wb-w-hint{font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.4}
  .todo-filter{display:flex;gap:4px;align-items:center}
  .todo-filter button{padding:3px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-card);color:var(--text-secondary);font-size:12px;cursor:pointer;transition:all .15s}
  .todo-filter button.active{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
  .todo-filter .tf-label{font-size:12px;color:var(--text-tertiary);margin-right:4px}
`;

const JS = `
  /* ===== v1.1: 全局搜索 + 天气 + 归档 ===== */
  (function(){
    const WK = CONFIG.storageKey + "::weather";
    const WMO = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',56:'🌧️',57:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',66:'🌧️',67:'🌧️',71:'🌨️',73:'🌨️',75:'❄️',77:'❄️',80:'🌦️',81:'🌧️',82:'🌧️',85:'🌨️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️'};
    const esc2 = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    // --- 全局搜索 ---
    function gSearch(q){
      q=q.trim().toLowerCase(); if(!q) return [];
      const out=[];
      CONFIG.modules.forEach(m=>(data[m.key]||[]).forEach(x=>{
        const t=(x.title||'').toLowerCase(), c=(x.note||x.content||'').toLowerCase();
        if(t.includes(q)||c.includes(q)) out.push({mk:m.key,mn:m.name,id:x.id,t:x.title,m:(x.note||x.content||x.category||'').slice(0,40)});
      }));
      return out.slice(0,30);
    }
    function gSearchHTML(r){
      if(!r.length) return '<div class="wb-sr-item"><span class="wb-sr-t" style="color:var(--text-tertiary)">没有匹配结果</span></div>';
      const g={}; r.forEach(x=>{if(!g[x.mk])g[x.mk]={n:x.mn,i:[]};g[x.mk].i.push(x)});
      return Object.entries(g).map(([k,v])=>'<div class="wb-sr-grp-ttl">'+esc2(v.n)+'</div>'+v.i.map(x=>'<div class="wb-sr-item" data-mk="'+x.mk+'" data-id="'+x.id+'"><span class="wb-sr-t">'+esc2(x.t)+'</span><span class="wb-sr-m">'+esc2(x.m)+'</span></div>').join('')).join('');
    }
    function initSearch(){
      const inp=document.getElementById('wb-si'), dd=document.getElementById('wb-sr');
      if(!inp||!dd) return;
      let comp=false;
      inp.addEventListener('compositionstart',()=>comp=true);
      inp.addEventListener('compositionend',()=>{comp=false;doS()});
      inp.addEventListener('input',()=>{if(!comp)doS()});
      inp.addEventListener('focus',()=>{if(inp.value.trim())doS()});
      function doS(){
        const q=inp.value; if(!q.trim()){dd.classList.remove('show');return}
        const r=gSearch(q); dd.innerHTML=gSearchHTML(r); dd.classList.add('show');
        dd.querySelectorAll('.wb-sr-item[data-mk]').forEach(el=>el.onclick=()=>{
          dd.classList.remove('show'); inp.value=''; go(el.dataset.mk);
          setTimeout(()=>openEditor(el.dataset.mk,(data[el.dataset.mk]||[]).find(x=>x.id==el.dataset.id)),80);
        });
      }
      document.addEventListener('click',e=>{if(!inp.contains(e.target)&&!dd.contains(e.target))dd.classList.remove('show')});
    }

    // --- 天气 ---
    function wCfg(){try{const r=storage.getItem(WK);return r?JSON.parse(r):null}catch(e){return null}}
    function wSet(c){storage.setItem(WK,JSON.stringify(c))}
    async function wFetch(lat,lon){const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,weather_code&timezone=auto');const j=await r.json();return{temp:Math.round(j.current.temperature_2m),code:j.current.weather_code}}
    async function wCity(lat,lon){try{const r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+lat+'&longitude='+lon+'&localityLanguage=zh');const j=await r.json();return j.city||j.locality||j.principalSubdivision||'未知'}catch(e){return'未知'}}
    async function wSearch(name){const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(name)+'&count=5&language=zh');const j=await r.json();return j.results||[]}
    function wUpdate(c){
      const ico=document.getElementById('wb-wi'),t=document.getElementById('wb-wt'),ci=document.getElementById('wb-wc');
      if(!ico)return;
      ico.textContent=WMO[c.code]||'🌡️'; t.textContent=c.temp!=null?c.temp+'°':'--'; ci.textContent=c.city||'点击设置';
    }
    function initWeather(){
      const w=document.getElementById('wb-w'),p=document.getElementById('wb-wp'),si=document.getElementById('wb-ws'),res=document.getElementById('wb-wr');
      if(!w)return;
      const saved=wCfg();
      if(saved&&saved.city) wUpdate(saved);
      else if(navigator.geolocation) navigator.geolocation.getCurrentPosition(async pos=>{
        const{latitude,longitude}=pos.coords;const city=await wCity(latitude,longitude);const w=await wFetch(latitude,longitude);
        const c={city,lat:latitude,lon:longitude,...w};wSet(c);wUpdate(c);
      },()=>wUpdate({city:'点击设置',temp:null,code:null}),{timeout:5000});
      w.onclick=e=>{e.stopPropagation();p.classList.toggle('show')};
      let sc=false;
      si.addEventListener('compositionstart',()=>sc=true);
      si.addEventListener('compositionend',()=>{sc=false;doWS()});
      si.addEventListener('input',()=>{if(!sc)doWS()});
      async function doWS(){
        const q=si.value.trim();if(!q||q.length<2){res.innerHTML='';return}
        const cities=await wSearch(q);
        res.innerHTML=cities.map(c=>'<div class="wb-w-ci" data-lat="'+c.latitude+'" data-lon="'+c.longitude+'" data-n="'+esc2(c.name)+'">'+esc2(c.name)+(c.admin1?', '+esc2(c.admin1):'')+'</div>').join('');
        res.querySelectorAll('.wb-w-ci').forEach(el=>el.onclick=async()=>{
          const lat=+el.dataset.lat,lon=+el.dataset.lon,n=el.dataset.n;const w=await wFetch(lat,lon);
          const c={city:n,lat,lon,...w};wSet(c);wUpdate(c);p.classList.remove('show');si.value='';res.innerHTML='';
        });
      }
      document.addEventListener('click',e=>{if(!w.contains(e.target)&&!p.contains(e.target))p.classList.remove('show')});
    }

    // --- 待办归档过滤 ---
    let todoFilter='all'; // all | active | done
    function initArchive(){
      const _origRenderModule = typeof renderModule === 'function' ? renderModule : null;
      if(!_origRenderModule) return;
      // Hook: after renderModule, add filter buttons for todo
      const _origRender = render;
      render = function(){
        _origRender();
        if(view==='todo'){
          const tb=document.querySelector('.toolbar');
          if(tb&&!tb.querySelector('.todo-filter')){
            const f=document.createElement('div');f.className='todo-filter';
            f.innerHTML='<span class="tf-label">筛选:</span><button data-f="all" class="'+(todoFilter==='all'?'active':'')+'">全部</button><button data-f="active" class="'+(todoFilter==='active'?'active':'')+'">未完成</button><button data-f="done" class="'+(todoFilter==='done'?'active':'')+'">已完成</button>';
            tb.appendChild(f);
            f.querySelectorAll('button').forEach(b=>b.onclick=()=>{
              todoFilter=b.dataset.f;
              f.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.f===todoFilter));
              applyTodoFilter();
            });
            applyTodoFilter();
          }
        }
      };
      function applyTodoFilter(){
        const grid=document.querySelector('.rec-grid');if(!grid)return;
        grid.querySelectorAll('.rec, .rec-card, [data-rid]').forEach(el=>{
          const id=el.dataset.id||el.dataset.rid||el.getAttribute('data-id');
          if(!id)return;
          const item=(data.todo||[]).find(x=>String(x.id)===String(id));
          if(!item)return;
          if(todoFilter==='active'&&item.done) el.style.display='none';
          else if(todoFilter==='done'&&!item.done) el.style.display='none';
          else el.style.display='';
        });
      }
    }

    // --- init ---
    setTimeout(()=>{initSearch();initWeather();initArchive()},100);
  })();
`;

const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let patched = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  if (html.includes('wb-v1.1-patched')) { console.log('⏭  ' + f + ' (已patch)'); return; }

  const isMobile = f.includes('-m.html');
  const isDesktop = !isMobile;

  // 1. Insert CSS before </style>
  const cssMarker = '</style>';
  const cssIdx = html.lastIndexOf(cssMarker);
  if (cssIdx === -1) { console.log('❌ ' + f + ' (no </style>)'); return; }
  html = html.slice(0, cssIdx) + '\n  /* wb-v1.1-patched */' + CSS + '\n' + html.slice(cssIdx);

  // 2. Insert HTML
  if (isDesktop) {
    // Insert topbar after <main class="main">
    const mainMarker = '<main class="main">';
    const mainIdx = html.indexOf(mainMarker);
    if (mainIdx === -1) { console.log('❌ ' + f + ' (no <main>)'); return; }
    const insertPos = mainIdx + mainMarker.length;
    const topbarHTML = `
  <div class="wb-topbar" id="wb-tb">
    <div class="wb-search">
      <span class="wb-sicon">🔍</span>
      <input id="wb-si" placeholder="全局搜索待办、笔记、记账…" autocomplete="off"/>
      <div class="wb-sr-dd" id="wb-sr"></div>
    </div>
    <div style="flex:1"></div>
    <div class="wb-weather" id="wb-w">
      <span class="wb-w-ico" id="wb-wi">🌡️</span><span class="wb-w-t" id="wb-wt">--</span><span class="wb-w-c" id="wb-wc">定位中…</span>
      <div class="wb-w-panel" id="wb-wp">
        <input id="wb-ws" placeholder="搜索城市（中文）…" autocomplete="off"/>
        <div class="wb-w-res" id="wb-wr"></div>
        <div class="wb-w-hint">输入城市名搜索，点击选择。首次使用会请求定位权限。</div>
      </div>
    </div>
  </div>`;
    html = html.slice(0, insertPos) + topbarHTML + '\n' + html.slice(insertPos);
  } else {
    // Mobile: insert a new topbar before #screen
    const screenMarker = '<div id="screen">';
    const screenIdx = html.indexOf(screenMarker);
    if (screenIdx === -1) { console.log('❌ ' + f + ' (no #screen)'); return; }
    const topbarHTML = `
  <div class="wb-topbar" id="wb-tb" style="min-width:0">
    <div class="wb-search" style="flex:1;max-width:none">
      <span class="wb-sicon">🔍</span>
      <input id="wb-si" placeholder="搜索待办、笔记、记账…" autocomplete="off"/>
      <div class="wb-sr-dd" id="wb-sr"></div>
    </div>
    <div class="wb-weather" id="wb-w" style="flex-shrink:0">
      <span class="wb-w-ico" id="wb-wi">🌡️</span><span class="wb-w-t" id="wb-wt">--</span><span class="wb-w-c" id="wb-wc">定位中…</span>
      <div class="wb-w-panel" id="wb-wp">
        <input id="wb-ws" placeholder="搜索城市…" autocomplete="off"/>
        <div class="wb-w-res" id="wb-wr"></div>
        <div class="wb-w-hint">输入城市名搜索</div>
      </div>
    </div>
  </div>`;
    html = html.slice(0, screenIdx) + topbarHTML + '\n  ' + html.slice(screenIdx);
  }

  // 3. Insert JS before init code
  // Desktop: before buildNav();  Mobile: before buildDrawer();
  const jsMarkerDesktop = 'buildNav();';
  const jsMarkerMobile = 'buildDrawer();';
  let jsIdx = html.indexOf(jsMarkerDesktop);
  if (jsIdx === -1) jsIdx = html.indexOf(jsMarkerMobile);
  if (jsIdx === -1) { console.log('❌ ' + f + ' (no init marker)'); return; }
  html = html.slice(0, jsIdx) + JS + '\n' + html.slice(jsIdx);

  fs.writeFileSync(f, html, 'utf8');
  console.log('✅ ' + f);
  patched++;
});

console.log('\nDone: ' + patched + ' files patched');
