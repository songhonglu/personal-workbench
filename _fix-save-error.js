// Fix: saveLocal 加 try-catch，超限时提示用户
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.match(/^workbench-.*\.html$/));
let n = 0;

files.forEach(f => {
  let html = fs.readFileSync(f, 'utf8');
  const orig = html;

  // saveLocal 加 try-catch
  html = html.replace(
    /saveLocal\(\)\{ storage\.setItem\(CONFIG\.storageKey, JSON\.stringify\(data\)\); \}/,
    'saveLocal(){ try{ storage.setItem(CONFIG.storageKey, JSON.stringify(data)); }catch(e){ toast("存储空间已满，请导出备份后清理"); console.error("[store] saveLocal:", e); } }'
  );

  if (html !== orig) { fs.writeFileSync(f, html); console.log('✅ ' + f); n++; }
  else console.log('⏭  ' + f);
});
console.log('\nDone: ' + n + ' files');
