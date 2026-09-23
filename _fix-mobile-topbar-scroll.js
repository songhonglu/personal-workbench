// Fix: 移动端搜索框+天气不固定，跟随页面滚动
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*-m\.html$/));
let n = 0;
files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  // .wb-topbar 从 sticky 改为 static，跟随滚动
  html = html.replace(
    /\.wb-topbar\{([^}]*?)position:sticky;top:0;z-index:20;([^}]*?)\}/,
    '.wb-topbar{$1position:static;$2}'
  );
  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
