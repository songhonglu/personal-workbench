// Fix: 1) 主题按钮移出天气弹窗 2) 天气弹窗内点击 stopPropagation
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  const isMobile = f.includes('-m.');

  // === 1. 修复 HTML 结构：把主题按钮从天气弹窗里移出来 ===
  // 当前结构: <div class="wb-w-panel" ...> ... <button class="wb-theme-btn" ...>🌙</button> </div>
  // 目标结构: </div> <button class="wb-theme-btn" ...>🌙</button>
  // 即：把 </div> 和 <button> 的顺序对调
  
  // 匹配: <button class="wb-theme-btn" id="wb-theme" ...>🌙</button>\n      </div>\n    </div>
  // 替换为: </div>\n    </div>\n    <button class="wb-theme-btn" id="wb-theme" ...>🌙</button>
  
  html = html.replace(
    /(\s*)<button class="wb-theme-btn" id="wb-theme" title="切换深色\/浅色">🌙<\/button>\s*<\/div>\s*<\/div>/,
    '\n      </div>\n    </div>\n    <button class="wb-theme-btn" id="wb-theme" title="切换深色/浅色">🌙</button>'
  );

  // === 2. 修复天气弹窗点击关闭：在弹窗内所有元素上 stopPropagation ===
  // 在 w.onclick 之前添加 p 的 click stopPropagation
  html = html.replace(
    /w\.onclick=e=>\{if\(p\.contains\(e\.target\)\)return;e\.stopPropagation\(\);p\.classList\.toggle\('show'\)\}/,
    "p.addEventListener('click',e=>e.stopPropagation());w.onclick=e=>{e.stopPropagation();p.classList.toggle('show')}"
  );

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});

console.log('\nDone: ' + n + ' files');
