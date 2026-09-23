// Fix: 编辑时图片预览没有自动带出来 — 改用 JS 设置初始值
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;
files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // 在图片上传 handler 里加一行：编辑时用 JS 设置初始值和预览
  const old = 'if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){fi.value=r.result;fp.src=r.result;fp.style.display="block";};r.readAsDataURL(file);};';
  const neu = 'if(d.image&&fi){fi.value=d.image;fp.src=d.image;fp.style.display="block";}if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){fi.value=r.result;fp.src=r.result;fp.style.display="block";};r.readAsDataURL(file);};';

  html = html.replace(old, neu);

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
