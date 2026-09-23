// Fix: 图片上传前压缩到 800px / JPEG 0.7 质量，避免超 localStorage 限制
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // 替换 onchange handler，加入图片压缩
  const oldHandler = 'if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){fi.value=r.result;fp.src=r.result;fp.style.display="block";};r.readAsDataURL(file);};';
  
  const newHandler = [
    'if(ff)ff.onchange=function(){var file=ff.files[0];if(!file)return;var r=new FileReader();r.onload=function(){var img=new Image();img.onload=function(){var c=document.createElement("canvas");var mw=800,mh=800;var w=img.width,h=img.height;if(w>mw){h=h*mw/w;w=mw;}if(h>mh){w=w*mh/h;h=mh;}c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);var du=c.toDataURL("image/jpeg",0.7);fi.value=du;fp.src=du;fp.style.display="block";};img.src=r.result;};r.readAsDataURL(file);};'
  ].join('');

  html = html.replace(oldHandler, newHandler);

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
