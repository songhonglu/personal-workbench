// Fix: 天气弹窗输入框点击立即关闭
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;
files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  // 修复：点击弹窗内部时不 toggle
  html = html.replace(
    /w\.onclick=e=>\{e\.stopPropagation\(\);p\.classList\.toggle\('show'\)\}/,
    "w.onclick=e=>{if(p.contains(e.target))return;e.stopPropagation();p.classList.toggle('show')}"
  );
  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
