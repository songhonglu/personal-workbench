// Fix: wb-topbar 加 position:relative + z-index:10，让天气弹窗能浮在内容上面
// 根因：backdrop-filter 创建了层叠上下文，弹窗 z-index 被困在 topbar 内部
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;
files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  // position:static → position:relative; z-index:10
  html = html.replace(
    /\.wb-topbar\{([^}]*?)position:static;([^}]*?)\}/,
    '.wb-topbar{$1position:relative;z-index:10;$2}'
  );
  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
