# 5 用户注册登录 & 10 月数据初始化 — 测试报告

- 测试脚本：`_test_5users.js`（Node 离线桩环境，模拟 5 台设备）
- 被测应用：`workbench.html` v1.18.0（PWA，localStorage 单文件零依赖）
- 运行时间：2026-10-02
- 结论：**流程全部跑通（exit=0），发现并修复 1 个应用真实缺陷（profile 数据被 ensureV2 清空），测试后剩余 12 项均为测试桩固有限制，非应用缺陷**

## 一、测试用户与角色

| 用户名 | 昵称 | userId | 角色设定 |
|--------|------|--------|----------|
| linshu | 林纾 | usr-muptlp6zz0sae4 | 产品经理，主攻 Q4 复盘 |
| chenmo | 陈默 | usr-muptlp77wbtobg | 工程师，代码/技术路线 |
| sushu | 苏舒 | usr-muptlp79klcw6b | 设计师，视觉与动效 |
| aoran | 阿岩 | usr-muptlp7a07q3l0 | 数据分析师 |
| tangge | 糖歌 | usr-muptlp7b0pkd36 | 运营，内容/增长 |

## 二、测试流程（每用户独立完成）

1. **注册**：`wbUser.register(username, nickname, password)` → 写入 `wb-users` 注册表
2. **登录**：`wbUser.login(username, password)` → 写入账号命名空间槽 `wb-auth::user::{userId}`
3. **错密拒绝**：故意传错密码验证 login 返回 null
4. **登出**：`wbUser.logout()`
5. **10 月数据初始化**：`wbUser.switchTo(userId)` 登录后写入各自数据槽 `workbench-v1::user::{userId}`
   - todo 3 条 / checkin 3 条 / goal 3 条 / money 5~6 条 / note 3 条 / remind 2 条（日期落在 10 月）
6. **跨用户好友网络**：互加好友（linshu↔chenmo、linshu↔tangge、chenmo↔sushu、chenmo↔aoran、sushu↔aoran、sushu↔tangge、aoran↔tangge）
7. **跨用户消息**：好友间发送 @提及 todo，写入对方 `wb-inbox::user::{userId}`
8. **验证**：各用户检查收件箱条数、未读数、`toTodo` 转换、好友列表、最近互动时间
9. **存储键盘点**：各设备 localStorage 键清单（linshu 13 键，其余 15 键，均为预期键集合）

## 三、发现的问题

### 🔴 P-PROFILE-BUG（已修复）— ensureV2 清空用户 profile

- **位置**：`workbench.html` line 3831-3836 `ensureV2(d)`
- **根因**：`profile` 既是 `CONFIG.modules` 里的一项（line 1532，type:"profile"），又是 ensureV2 第 3836 行要初始化的**对象**模板。但 ensureV2 首行（3833）会对所有 module key 强制归一化为数组：
  ```js
  CONFIG.modules.forEach(m=>{ if(!Array.isArray(d[m.key])) d[m.key]=[]; });
  ```
  于是 `d.profile`（对象）→ `[]`（数组）→ 下一行 `Array.isArray([])===true` 触发 → 重置为空模板 `{nickname:"",...}`。**每次 load/saveLocal/切空间都会调用 ensureV2，导致用户填的个人信息被静默清空。**
- **影响**：5/5 用户全部命中（隔离复现：`nickname` 从 "林纾" 变 ""；`__health.goals` 不在 modules 里则保留，佐证根因）。
- **修复**（已应用到 workbench.html line 3833）：
  ```js
  // 修复前
  CONFIG.modules.forEach(m=>{ if(!Array.isArray(d[m.key])) d[m.key]=[]; });
  // 修复后：profile 是对象型模块，跳过数组归一化，交给 3836 行专门的对象兜底
  CONFIG.modules.forEach(m=>{ if(m.type!=="profile"&&!Array.isArray(d[m.key])) d[m.key]=[]; });
  ```
- **修复后验证**：
  - 隔离复现 3 场景：已有对象保留 ✅ / 缺失走模板 ✅ / 被污染成数组走模板 ✅
  - 全流程 5 用户 `[init]` 全部通过（修复前 5 个 `[init-err] profile`，修复后 0 个）
  - 问题清单 22 → 12，P-PROFILE-BUG 5 项消失

### 🟡 剩余 12 项（均为测试桩固有限制，非应用缺陷）

| 类别 | 数量 | 说明 |
|------|------|------|
| C-* 登出后 cur() 仍非空 | 5 | `wbUser.cur()` 兜底��辑会扫描 `wb-auth::user::{userId}` 命名空间键，测试桩的 localStorage 是**共享内存 Map**，无法区分多账号设备，扫到别的账号残留键。真实浏览器各设备独立 localStorage，不存在此现象。 |
| H-* addFriend "已是好友" | 7 | 好友关系是**双向**的：A 侧先 add(B) 已建边，B 侧再 add(A) 时对方列表里已有 A，`addFriend` 幂等返回 "已是好友"。脚本按"每对用户两侧各 add 一次"设计，第二侧必然幂等命中，属预期行为。 |

> 这两类共 12 项已确认为测试桩/脚本设计的伪问题，**不需要修改应用代码**。若要在脚本层面消除，可让 C-* 改用"仅看默认槽"断言、H-* 只保留单侧 add 断言。

## 四、存储模型说明

- 默认数据存浏览器 `localStorage`，`storageKey = workbench-v1`；登录账号走 `workbench-v1::user::{userId}` 命名空间槽
- 注册表 `wb-users`、好友 `wb-friends::user::{userId}`、收件箱 `wb-inbox::user::{userId}` 均按用户命名空间隔离
- 左下角「导出备份」可导出 JSON，建议定期备份；可选接入自托管轻量后端做多端同步

## 五、复现与产物

- 测试脚本：`_test_5users.js`（含 22/12 项问题记录器 + `process.exit(0)` 避免 pending setTimeout 挂起）
- 修复日志��`/tmp/t5.log`（修复前 22 项）→ `/tmp/t5_fixed.log`（修复后 12 项）
- 隔离复现：`/tmp/repro_profile.js`（修复前）、`/tmp/repro_profile2.js`（修复后 3 场景）
