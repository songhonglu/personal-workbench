// _fix-image-onerror.js — 给缩略图加 onerror 兜底，坏图自动隐藏
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^workbench-.*\.html$/.test(f));

let changed = 0;
for (const f of files) {
  const fp = path.join(dir, f);
  let html = fs.readFileSync(fp, 'utf8');
  let modified = false;

  // 找到缩略图 img 的生成代码，加 onerror
  // 模式: <img ... src="${attr(it.image)}" ...>
  // 需要加 onerror="this.style.display='none'"

  // 1. 列表中的缩略图 — 找 img 标签里 src="${attr(it.image)}" 的，加 onerror
  //    各种变体: it.image, d.image, item.image 等
  const patterns = [
    // 直接在 HTML 模板字符串中的 img
    [/src="\$\{attr\(([a-z.]+\.image)\)\}"([^>]*?)>/g, 'src="${attr($1)}"$2 onerror="this.style.display=\'none\'">'],
  ];

  for (const [re, replacement] of patterns) {
    const before = html;
    html = html.replace(re, replacement);
    if (html !== before) modified = true;
  }

  // 2. 编辑器预览图 fp.src = ... 加 onerror
  //    找 fp.src= 赋值后加 fp.onerror=
  if (html.includes('fp.src=') && !html.includes('fp.onerror=')) {
    html = html.replace(
      /fp\.src=([^;]+);/g,
      'fp.src=$1;fp.onerror=()=>{fp.src="";fp.style.display="none";};'
    );
    modified = true;
  }

  // 3. 动态创建的 img 元素加 onerror
  //    找 .src= 赋值（非 fp.src 已处理）加 onerror
  //    只处理缩略图相关的

  if (modified) {
    fs.writeFileSync(fp, html, 'utf8');
    changed++;
    console.log('✅', f);
  } else {
    console.log('⏭️', f, '(no change)');
  }
}

console.log(`\nDone: ${changed}/${files.length} files updated`);
