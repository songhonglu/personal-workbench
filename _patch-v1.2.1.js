// v1.2.1 patch: 主题+天气城市 改为共享数据（跟随云同步）
const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let patched = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // 1. 主题：从 localStorage 改为 data.__theme
  html = html.replace(
    /const saved = storage\.getItem\(TK\);/,
    'const saved = data.__theme || "light";'
  );
  html = html.replace(
    /document\.documentElement\.removeAttribute\('data-theme'\);\s*storage\.setItem\(TK,'light'\);/,
    "document.documentElement.removeAttribute('data-theme'); data.__theme='light'; store.save();"
  );
  html = html.replace(
    /document\.documentElement\.setAttribute\('data-theme','dark'\);\s*storage\.setItem\(TK,'dark'\);/,
    "document.documentElement.setAttribute('data-theme','dark'); data.__theme='dark'; store.save();"
  );

  // 2. 天气：从 localStorage 改为 data.__weather
  html = html.replace(
    /function wCfg\(\)\{try\{const r=storage\.getItem\(WK\);return r\?JSON\.parse\(r\):null\}catch\(e\)\{return null\}\}/,
    'function wCfg(){return data.__weather||null}'
  );
  html = html.replace(
    /function wSet\(c\)\{storage\.setItem\(WK,JSON\.stringify\(c\)\)\}/,
    'function wSet(c){data.__weather=c;store.save()}'
  );

  // 3. 添加同步后自动应用主题+天气的 hook
  const hookMarker = 'initRepeatBadge();';
  const hookIdx = html.indexOf(hookMarker);
  if (hookIdx !== -1) {
    const insertPos = hookIdx + hookMarker.length;
    const hook = [
      '',
      '    // 同步后自动应用主题+天气',
      '    const _origSyncPull = sync.pull.bind(sync);',
      '    sync.pull = async function(silent) {',
      '      const oldTheme = data.__theme;',
      '      const oldWeather = data.__weather;',
      '      await _origSyncPull(silent);',
      '      if (data.__theme !== oldTheme) {',
      '        if (data.__theme === "dark") document.documentElement.setAttribute("data-theme","dark");',
      '        else document.documentElement.removeAttribute("data-theme");',
      '        const btn = document.getElementById("wb-theme");',
      '        if (btn) btn.textContent = data.__theme === "dark" ? "☀️" : "🌙";',
      '      }',
      '      if (data.__weather !== oldWeather && data.__weather) {',
      '        const ico=document.getElementById("wb-wi"),t=document.getElementById("wb-wt"),ci=document.getElementById("wb-wc");',
      '        if(ico){const WMO2={0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌦️",55:"🌧️",56:"🌧️",57:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",66:"🌧️",67:"🌧️",71:"🌨️",73:"🌨️",75:"❄️",77:"❄️",80:"🌦️",81:"🌧️",82:"🌧️",85:"🌨️",86:"❄️",95:"⛈️",96:"⛈️",99:"⛈️"};',
      '        ico.textContent=WMO2[data.__weather.code]||"🌡️";t.textContent=data.__weather.temp!=null?data.__weather.temp+"°":"--";ci.textContent=data.__weather.city||"点击设置";}',
      '      }',
      '    };'
    ].join('\n');
    html = html.slice(0, insertPos) + hook + '\n  ' + html.slice(insertPos);
  }

  if (html !== orig) {
    fs.writeFileSync(f, html, 'utf8');
    console.log('✅ ' + f);
    patched++;
  } else {
    console.log('⏭  ' + f + ' (无变化)');
  }
});

console.log('\nDone: ' + patched + ' files patched');
