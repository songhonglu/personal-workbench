# Changelog

## v1.17.1 — 多用户体系修补版 · 好友消息通道健壮性（2026-10-01）

### 修复：`wbFriends` 健壮性
- `wbFriends.send()` 清理：移除冗余的 `iMap` 读取与未使用变量 `their`，同浏览器/跨设备两条路径的注释规范统一
- `wbFriends.removeFriend()` 补齐跨设备端点：启用同步后端时 `POST /api/friends/{me}/remove` 解除服务端好友关系（best-effort，失败不阻塞本地）

### 对齐
- `APP_VERSION` 同步 1.17.0 → 1.17.1；内置 CHANGELOG 与 `docs/multiuser-plan.md` 对齐（密码本地 FNV-1a 散列说明，非安全级哈希）
- 质检门禁：`node _test_smoke.js` 全绿、`workbench.html` 全部 `<script>` 块 `new Function` 编译通过、顶层 const/let/function 重复声明扫描无冲突

---

## v1.17.0 — 多用户体系 + 好友系统（2026-10-01）

### 新增：账号体系（`wbUser`）
- 本地账号注册 / 登录 / 登出，密码以 SHA-256 + 随机盐本地哈希存储（`crypto.subtle.digest`），明文密码不落盘
- 账号数据按 `userId` 命名空间隔离：`workbench-v1::user::{userId}` 存储槽
- 未登录仍走原 `CONFIG.storageKey`（完全向后兼容，旧数据零迁移）
- 本机已注册账号列表（`wbUser.known()`）支持一键切换
- `store.load()` / `store.saveLocal()` 自动路由到当前账号槽位；`store.reloadForAccount()` 供账号切换后刷新

### 新增：好友系统（`wbFriends`）
- 双向好友关系（`FRIENDS_KEY`），支持添加 / 删除好友
- 好友间发送待办（`type:"todo"`）和提醒（`type:"remind"`）
- 本地同浏览器：直接写对方本地收件箱（`INBOX_KEY::user::{uid}`），零依赖即可用
- 跨设备：启用 `sync-server.js` 后走 `POST /api/friends/{uid}/send` + 轮询拉取，`markread` 同步已读状态
- 收件箱消息一键「转我的待办」/「转我的提���」，保留来源好友标注
- 快捷条下方「来自好友」未读横幅，点击跳转好友视图
- 新增侧栏导航入口「账号与好友」→ `renderFriends()` 视图

### 升级：sync-server.js v2
- 保留原有 `/data` GET/PUT 多端同步协议（token 隔离保险箱）
- 新增端点：
  - `POST /api/friends/{uid}/add`  — 登记双向好友关系
  - `POST /api/friends/{uid}/send`  — 跨设备投递收件箱消息
  - `GET  /api/friends/{uid}/inbox` — 拉取该用户收件箱（前端轮询）
  - `POST /api/friends/{uid}/markread` — 同步已读标记
  - `POST /api/friends/{uid}/remove` — 解除好友关系
- 数据文件 `workbench-sync-data.json` 新增 `inbox` / `friends` 字段，向后兼容
- 认证支持 `?token=` 或 `Authorization: Bearer` 二选一

### 新增：质检门禁强化
- `_test_smoke.js` 新增 27 条多用户断言（账号/好友/收件箱/sync-server 全链路）
- 新增顶层重复声明静态扫描（`const`/`let`/`function` 列 0 检测）
- 全量冒烟测试：78 PASS / 0 FAIL

### 修复
- `wbUser.cur()` 循环调用（`_ns() → cur() → _ns()`）改为固定 key 探测，消除栈溢出
- `wbFriends.markRead` 逻辑修复 + 已读标记跨设备推送
- `wbFriends.send` 前后端协议对齐（`msg` 字段展开到 body）

---

## v1.16.0 — P2 批次（多空间架构 + 场景预设模板 + 换肤增强）
- 多空间架构（`data.__spaces` + `data.__activeSpace`），支持多套工作台数据并行
- 场景预设模板（办公 / 学习 / 生活 / 混合）一键生成
- 换肤增强：indigo / sage 色板
- 笔记图片附件支持
- 番茄钟自定义时长
- 提醒分组 / 暂停一周
- 敏感字段本地 XOR 加密存储

## v1.15.0 — P0 批次（移动端修复 + 记账深化）
- 移动端底栏 Tab / 键盘弹起遮挡修复
- 记账转账类型、批量操作、CSV 导出
- 习惯打卡数字型目标（步进器 + 进度条）
