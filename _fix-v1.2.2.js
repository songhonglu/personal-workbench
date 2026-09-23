// Fix 3 issues: 1) weather z-index 2) image upload 3) PC layout width
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;
  const isMobile = f.includes('-m.');

  // === 1. 天气弹窗 z-index 50 → 200 ===
  html = html.replace(
    /\.wb-w-panel\{([^}]*?)z-index:50;([^}]*?)\}/,
    '.wb-w-panel{$1z-index:200;$2}'
  );

  // === 2. 图片 URL 改为上传/拍照 + URL 备选 + 预览 ===
  // 用 indexOf 精确匹配，避免正则转义问题
  const oldImgLine = 'fields+=`<div class="field"><label>图片 URL（可选）</label><input id="f-image" value="${attr(d.image||\'\')}" placeholder="https://..."/></div>`;';
  const newImgLine = [
    'fields+=`<div class="field"><label>图片（可选）</label>',
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">',
    '<input type="file" id="f-image-file" accept="image/*" capture="environment" style="font-size:12px;flex:1;min-width:120px"/>',
    '<input id="f-image" value="${attr(d.image||\'\')}" placeholder="或粘贴URL" style="flex:1;min-width:120px"/>',
    '</div>',
    '<img id="f-image-prev" src="${attr(d.image||\'\')}" style="display:${d.image?\'block\':\'none\'};max-width:100%;max-height:100px;border-radius:8px;margin-top:8px;object-fit:cover"/>',
    '</div>`;'
  ].join('');

  const imgIdx = html.indexOf(oldImgLine);
  if (imgIdx !== -1) {
    html = html.slice(0, imgIdx) + newImgLine + html.slice(imgIdx + oldImgLine.length);
  }

  // 在 document.body.appendChild(overlay); 后添加图片上传处理
  const oldAppend = 'document.body.appendChild(overlay);\n  const close=()=>overlay.remove();';
  const newAppend = [
    'document.body.appendChild(overlay);',
    '  // image upload handler',
    '  (function(){var ff=overlay.querySelector("#f-image-file"),fi=overlay.querySelector("#f-image"),fp=overlay.querySelector("#f-image-prev");',
    '  if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){fi.value=r.result;fp.src=r.result;fp.style.display="block";};r.readAsDataURL(file);};',
    '  if(fi)fi.oninput=function(){var v=fi.value.trim();if(v){fp.src=v;fp.style.display="block";}else{fp.style.display="none";}};',
    '  })();',
    '  const close=()=>overlay.remove();'
  ].join('\n');

  const appendIdx = html.indexOf(oldAppend);
  if (appendIdx !== -1) {
    html = html.slice(0, appendIdx) + newAppend + html.slice(appendIdx + oldAppend.length);
  }

  // === 3. PC端内容区铺满 ===
  if (!isMobile) {
    html = html.replace(
      /\.main > #screen \{ max-width: 1180px; \}/,
      '.main > #screen { max-width: 100%; }'
    );
  }

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});

console.log('\nDone: ' + n + ' files');
