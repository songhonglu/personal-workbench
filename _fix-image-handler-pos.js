// Fix: 图片 handler 插错位置，从 confirmCalUncheck 移到 openEditor
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;

const handlerBlock = [
  '  // image upload handler',
  '  (function(){var ff=overlay.querySelector("#f-image-file"),fi=overlay.querySelector("#f-image"),fp=overlay.querySelector("#f-image-prev");',
  '  if(d.image&&fi){fi.value=d.image;fp.src=d.image;fp.style.display="block";}if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){fi.value=r.result;fp.src=r.result;fp.style.display="block";};r.readAsDataURL(file);};',
  '  if(fi)fi.oninput=function(){var v=fi.value.trim();if(v){fp.src=v;fp.style.display="block";}else{fp.style.display="none";}};',
  '  })();'
].join('\n');

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // 1. 从 confirmCalUncheck 中删除错误插入的 handler
  // 匹配: handler + \n  const close=()=>overlay.remove();\n  overlay.onclick...#cu-cancel
  const wrongPattern = handlerBlock + '\n  const close=()=>overlay.remove();\n  overlay.onclick=e=>{ if(e.target===overlay) close(); };\n  overlay.querySelector("#cu-cancel")';
  const wrongReplace = '  const close=()=>overlay.remove();\n  overlay.onclick=e=>{ if(e.target===overlay) close(); };\n  overlay.querySelector("#cu-cancel")';
  html = html.replace(wrongPattern, wrongReplace);

  // 2. 插入到 openEditor 中正确位置
  // 匹配: document.body.appendChild(overlay);\n  const close=()=>overlay.remove();\n  overlay.onclick...#m-cancel
  const correctPattern = 'document.body.appendChild(overlay);\n  const close=()=>overlay.remove();\n  overlay.onclick=e=>{ if(e.target===overlay) close(); };\n  overlay.querySelector("#m-cancel")';
  const correctReplace = 'document.body.appendChild(overlay);\n' + handlerBlock + '\n  const close=()=>overlay.remove();\n  overlay.onclick=e=>{ if(e.target===overlay) close(); };\n  overlay.querySelector("#m-cancel")';
  html = html.replace(correctPattern, correctReplace);

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
