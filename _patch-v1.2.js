// v1.2 patch: 深色模式 + 键盘快捷键 + 周期任务 + 记账月度视图
const fs = require('fs');

const CSS = `
  /* ===== v1.2: 深色模式 + 月度视图 + 周期任务 ===== */
  :root[data-theme="dark"]{
    --page-bg:#1a1a2e;--surface-card:#252537;--surface-nested:#1e1e30;--surface-glass:rgba(37,37,55,.85);
    --border:#333348;--border-input:#3a3a52;--glass-border:rgba(50,50,72,.5);
    --text:#e0e0e8;--text-secondary:#a0a0b8;--text-tertiary:#6a6a82;
    --accent-muted:rgba(100,100,160,.15);
    --drawer-bg:#12121f;--drawer-bg-top:#16162a;--drawer-text:#c0c0d8;
    --drawer-text-mute:rgba(192,192,216,.5);--drawer-hover:rgba(192,192,216,.08);--drawer-active:rgba(192,192,216,.12);
    --shadow-card:0 4px 16px rgba(0,0,0,.3);--shadow-overlay:0 8px 32px rgba(0,0,0,.4);--shadow-hover:0 16px 48px rgba(0,0,0,.5);
    --body-glow-1:rgba(100,100,160,.05);--body-glow-2:rgba(100,100,160,.03);--body-glow-3:rgba(100,100,160,.02);
    --orb-1:rgba(100,100,160,.08);--orb-2:rgba(100,100,160,.06);--orb-3:rgba(100,100,160,.04);
    --greet-image:radial-gradient(120% 130% at 85% 15%,rgba(100,100,160,.1),rgba(100,100,160,.03) 55%,rgba(100,100,160,0) 100%);
  }
  .wb-theme-btn{cursor:pointer;padding:5px 10px;border-radius:var(--radius-control);border:1px solid var(--border);background:var(--surface-card);font-size:16px;line-height:1;transition:all .2s;flex-shrink:0}
  .wb-theme-btn:hover{border-color:var(--accent)}
  /* 月度视图 */
  .wb-month-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:8px}
  .wb-month-card{padding:10px 12px;border-radius:8px;background:var(--surface-nested);border:1px solid var(--border)}
  .wb-month-card .wb-mh{font-size:12px;color:var(--text-secondary);margin-bottom:4px}
  .wb-month-card .wb-mv{font-size:16px;font-weight:600}
  .wb-month-card .wb-ms{font-size:11px;color:var(--text-tertiary);margin-top:2px}
  /* 周期任务标记 */
  .wb-repeat-badge{display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:1px 6px;border-radius:4px;background:var(--accent-muted);color:var(--accent-dark);margin-left:4px}
`;

const JS = `
  /* ===== v1.2: 深色模式 + 快捷键 + 周期任务 + 月度视图 ===== */
  (function(){
    const TK = CONFIG.storageKey + "::theme";

    // --- 深色模式 ---
    function initTheme(){
      const saved = storage.getItem(TK);
      if (saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
      const btn = document.getElementById('wb-theme');
      if (!btn) return;
      function update(){ const dark = document.documentElement.getAttribute('data-theme')==='dark'; btn.textContent = dark ? '☀️' : '🌙'; }
      update();
      btn.onclick = () => {
        const dark = document.documentElement.getAttribute('data-theme')==='dark';
        if (dark) { document.documentElement.removeAttribute('data-theme'); storage.setItem(TK,'light'); }
        else { document.documentElement.setAttribute('data-theme','dark'); storage.setItem(TK,'dark'); }
        update();
      };
    }

    // --- 键盘快捷键 ---
    function initKeys(){
      document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = (e.target.tagName||'').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        // 1-5: 切模块
        if (e.key >= '1' && e.key <= '5') {
          const mods = CONFIG.modules;
          const idx = parseInt(e.key) - 1;
          if (mods[idx]) go(mods[idx].key);
          return;
        }
        // n/N: 新建
        if (e.key === 'n' || e.key === 'N') {
          if (view !== 'home' && view !== 'insight') { openEditor(view, null); }
          return;
        }
        // /: 聚焦搜索
        if (e.key === '/') {
          e.preventDefault();
          const s = document.getElementById('wb-si');
          if (s) s.focus();
          return;
        }
        // Esc: 关闭弹窗
        if (e.key === 'Escape') {
          const ov = document.querySelector('.overlay');
          if (ov) { ov.remove(); return; }
          const dd = document.getElementById('wb-sr');
          if (dd && dd.classList.contains('show')) { dd.classList.remove('show'); return; }
          const wp = document.getElementById('wb-wp');
          if (wp && wp.classList.contains('show')) { wp.classList.remove('show'); return; }
          return;
        }
        // g: 回首页
        if (e.key === 'g') { go('home'); return; }
      });
    }

    // --- 周期任务 ---
    function checkRecurring(){
      const todos = data.todo || [];
      const today = new Date().toISOString().slice(0,10);
      let changed = false;
      todos.forEach(t => {
        if (!t.repeat || t.repeat === 'none' || !t.done) return;
        const last = t.lastReset || t.lastDone || '';
        if (!last) { t.lastReset = today; changed = true; return; }
        const lastDate = new Date(last);
        const todayDate = new Date(today);
        let shouldReset = false;
        if (t.repeat === 'daily') {
          shouldReset = (todayDate - lastDate) >= 86400000;
        } else if (t.repeat === 'weekly') {
          shouldReset = (todayDate - lastDate) >= 7 * 86400000;
        } else if (t.repeat === 'monthly') {
          shouldReset = todayDate.getMonth() !== lastDate.getMonth() || todayDate.getFullYear() !== lastDate.getFullYear();
        }
        if (shouldReset) {
          t.done = false;
          t.lastReset = today;
          changed = true;
        }
      });
      if (changed) { store.save(); }
    }

    // Hook editor: 添加重复选项
    const _origOpenEditor = typeof openEditor === 'function' ? openEditor : null;
    if (_origOpenEditor) {
      window.openEditor = function(key, item) {
        _origOpenEditor(key, item);
        if (key !== 'todo') return;
        setTimeout(() => {
          const modal = document.querySelector('.modal');
          if (!modal || modal.querySelector('#f-repeat')) return;
          const actions = modal.querySelector('.modal-actions');
          if (!actions) return;
          const cur = (item && item.repeat) || 'none';
          const field = document.createElement('div');
          field.className = 'field';
          field.innerHTML = '<label>重复</label><div class="seg-group" id="f-repeat" style="display:flex;gap:4px">'
            + ['none','daily','weekly','monthly'].map(v => {
              const label = {none:'不重复',daily:'每天',weekly:'每周',monthly:'每月'}[v];
              return '<button type="button" class="seg' + (cur===v?' on':'') + '" data-v="' + v + '" style="flex:1;padding:6px;border:1px solid var(--border-input);border-radius:6px;background:' + (cur===v?'var(--accent)':'var(--surface-nested)') + ';color:' + (cur===v?'var(--on-accent)':'var(--text-secondary)') + ';font-size:12px;cursor:pointer">' + label + '</button>';
            }).join('') + '</div>';
          actions.parentNode.insertBefore(field, actions);
          field.querySelectorAll('.seg').forEach(b => b.onclick = () => {
            field.querySelectorAll('.seg').forEach(x => {
              x.classList.remove('on');
              x.style.background = 'var(--surface-nested)';
              x.style.color = 'var(--text-secondary)';
            });
            b.classList.add('on');
            b.style.background = 'var(--accent)';
            b.style.color = 'var(--on-accent)';
          });
          // Hook save
          const saveBtn = modal.querySelector('#f-save');
          if (saveBtn) {
            const origClick = saveBtn.onclick;
            saveBtn.onclick = function() {
              origClick.call(this);
              const repeatVal = field.querySelector('.seg.on')?.dataset.v || 'none';
              const todos = data.todo || [];
              if (item) {
                const found = todos.find(x => x.id === item.id);
                if (found) { found.repeat = repeatVal; if (repeatVal === 'none') delete found.lastReset; }
              } else {
                if (todos[0]) todos[0].repeat = repeatVal;
              }
              store.save();
            };
          }
        }, 50);
      };
    }

    // --- 记账月度视图 ---
    function initMonthlyView(){
      const _origRender = render;
      render = function(){
        _origRender();
        if (view === 'money') {
          const side = document.querySelector('.mod-side');
          if (!side || side.querySelector('.wb-month-grid')) return;
          const all = data.money || [];
          const byMonth = {};
          all.forEach(x => {
            const m = (x.date || '').slice(0, 7);
            if (!m) return;
            if (!byMonth[m]) byMonth[m] = { inc: 0, exp: 0, cnt: 0 };
            if (x.type === 'income') byMonth[m].inc += +x.amount;
            else byMonth[m].exp += +x.amount;
            byMonth[m].cnt++;
          });
          const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
          if (!months.length) return;
          const cards = months.map(m => {
            const d = byMonth[m];
            const bal = d.inc - d.exp;
            const balCol = bal >= 0 ? 'var(--module-1)' : 'var(--danger)';
            return '<div class="wb-month-card"><div class="wb-mh">' + m + '</div>'
              + '<div class="wb-mv" style="color:' + balCol + '">¥' + bal + '</div>'
              + '<div class="wb-ms">收¥' + d.inc + ' 支¥' + d.exp + ' · ' + d.cnt + '笔</div></div>';
          }).join('');
          const sec = document.createElement('div');
          sec.className = 'side-card';
          sec.style.marginTop = '12px';
          sec.innerHTML = '<div class="sh">📅 月度收支</div><div class="wb-month-grid">' + cards + '</div>';
          side.appendChild(sec);
        }
      };
    }

    // --- 周期任务标记 ---
    function initRepeatBadge(){
      const _origRender2 = render;
      render = function(){
        _origRender2();
        if (view === 'todo') {
          document.querySelectorAll('.rec, .rec-card, [data-rid]').forEach(el => {
            const id = el.dataset.id || el.dataset.rid || el.getAttribute('data-id');
            if (!id) return;
            const item = (data.todo || []).find(x => String(x.id) === String(id));
            if (!item || !item.repeat || item.repeat === 'none') return;
            if (el.querySelector('.wb-repeat-badge')) return;
            const title = el.querySelector('.rec-title, .card-title, h3, .rt, .rn');
            if (title) {
              const label = {daily:'每天',weekly:'每周',monthly:'每月'}[item.repeat] || '';
              const badge = document.createElement('span');
              badge.className = 'wb-repeat-badge';
              badge.textContent = '🔁 ' + label;
              title.appendChild(badge);
            }
          });
        }
      };
    }

    // --- init ---
    checkRecurring();
    initTheme();
    initKeys();
    initMonthlyView();
    initRepeatBadge();
  })();
`;

const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let patched = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  if (html.includes('wb-v1.2-patched')) { console.log('⏭  ' + f + ' (已patch)'); return; }

  // 1. CSS before </style>
  const cssIdx = html.lastIndexOf('</style>');
  if (cssIdx === -1) { console.log('❌ ' + f); return; }
  html = html.slice(0, cssIdx) + '\n  /* wb-v1.2-patched */' + CSS + '\n' + html.slice(cssIdx);

  // 2. Theme toggle button: add to wb-topbar (after weather)
  const weatherEnd = '<span class="wb-w-c" id="wb-wc">';
  const wIdx = html.indexOf(weatherEnd);
  if (wIdx !== -1) {
    // Find the closing </div> of wb-weather
    const afterWeather = html.indexOf('</div>', html.indexOf('</div>', wIdx) + 6);
    if (afterWeather !== -1) {
      const insertPos = afterWeather + 6;
      html = html.slice(0, insertPos) + '\n    <button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>' + html.slice(insertPos);
    }
  }

  // 3. JS before init code
  let jsIdx = html.indexOf('buildNav();');
  if (jsIdx === -1) jsIdx = html.indexOf('buildDrawer();');
  if (jsIdx === -1) { console.log('❌ ' + f + ' (no init)'); return; }
  html = html.slice(0, jsIdx) + JS + '\n' + html.slice(jsIdx);

  fs.writeFileSync(f, html, 'utf8');
  console.log('✅ ' + f);
  patched++;
});

console.log('\nDone: ' + patched + ' files patched');
