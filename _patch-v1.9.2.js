/* v1.9.2 补丁：修复 sync 对象 _base 方法重名冲突
 *
 * 根因：v1.8 引入字段级合并时，在 sync 对象字面量里新增了第二个 _base()
 * （合并基线快照），把原有的 _base()（URL 前缀助手）覆盖掉了。
 * _url() 里 this._base() 于是返回快照对象/null，拼出 "[object Object]/data?token=…"
 * 这样的非法地址 → 9/25(v1.8) 起所有端 push/pull 全部 404：
 *   - 手机拉不到云端数据 → 头像保持默认
 *   - 手机推不上去 → 待办改动永远到不了 PC
 * 修复：URL 助手改名 _apiBase()，快照版 _base() 保留（pull/mergeData 用的是它）。
 *
 * 附带：SW 注册加 updateViaCache:'none' 防止 sw.js 被 HTTP 缓存拖住更新；
 * 同步面板显示版本号，便于用户确认两端都跑上了修复版。
 */
const fs = require('fs');

const files = ['workbench.html', 'workbench-m.html'];

/* [旧串, 新串, 说明, 期望次数] */
const patches = [
  [
    `  _base(){ return (this.cfg().url||"").replace(/\\/+$/,""); },
  _url(p){ return this._base() + p + "?token=" + encodeURIComponent(this.cfg().token||""); },`,
    `  _apiBase(){ return (this.cfg().url||"").replace(/\\/+$/,""); },   // v1.9.2: 原 _base 被下方快照版重名覆盖，致 _url 拼出非法地址
  _url(p){ return this._apiBase() + p + "?token=" + encodeURIComponent(this.cfg().token||""); },`,
    'sync._base 重名修复（URL 助手改名 _apiBase）',
    1
  ],
  [
    `<div class="sub">连接一个轻量后端，手机 / 电脑 / 平板的数据自动保持一致。未配置时数据仍只存本机。</div>`,
    `<div class="sub">连接一个轻量后端，手机 / 电脑 / 平板的数据自动保持一致。未配置时数据仍只存本机。当前版本 <b>v1.9.2</b>（同步修复版）。</div>`,
    '同步面板版本标记 v1.9.2',
    1
  ],
  [
    `navigator.serviceWorker.register('sw.js')`,
    `navigator.serviceWorker.register('sw.js',{updateViaCache:'none'})`,
    'SW 注册 updateViaCache:none',
    1
  ]
];

let failed = false;
for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  console.log(`\n=== ${f} ===`);
  for (const [oldS, newS, label, expect] of patches) {
    const n = src.split(oldS).length - 1;
    if (n !== expect) {
      console.error(`  ✗ [${label}] 命中 ${n} 次（期望 ${expect}），中止！`);
      failed = true;
      continue;
    }
    src = src.replace(oldS, newS);
    console.log(`  ✓ [${label}]`);
  }
  if (!failed) fs.writeFileSync(f, src);
}
if (failed) { console.error('\n补丁未完全应用，文件未写入。'); process.exit(1); }
console.log('\n全部补丁应用成功 ✔');
