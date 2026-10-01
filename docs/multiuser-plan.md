# 多用户方案（v1.17.0）

> 目标：同一份 workbench.html 支持多个用户使用。每个账号只能看到自己的数据；
> 账号之间可以通过「添加好友」给对方发送待办 / 提醒卡片。

## 设计原则

1. **零依赖不变**：纯前端 `workbench.html`，未部署后端时行为与现状完全一致（本地单账号）。
2. **数据隔离**：启用账号体系后，所有读写按 `userId` 命名空间隔离；密码前端 SHA-256 加盐哈希，绝不存明文。
3. **好友通信**：复用现有 sync-server 协议扩展 `/api/friends`、`/api/inbox` 端点；未部署后端时好友功能自动禁用并给出提示。
4. **向后兼容**：未登录用户的所有数据保留在默认槽位，注册/登录后首次进入会询问是否导入旧数据。

## 数据模型

### 前端 localStorage 结构（账号模式）

```
wb-auth           = { username, passHash, salt, userId, ts }   // 当前登录账号
wb-users-registry = { [username]: { userId, nickname } }       // 本地用户注册表（好友搜索用）
wb:workbench-v1   = 现有工作数据（原 key 不变，账号模式下仅属于当前用��）
```

- 切换账号 = 登出当前 → 载入目标账号数据（数据按账号槽位存取，槽位键：`workbench-v1::user::{userId}`）
- 未启用账号体系时仍用 `workbench-v1` 默认槽位，旧数据零迁移

### 好友关系（sync-server 持久化）

```jsonc
// server-users.json
{ "friendGraph": { "userA": ["userB"], "userB": ["userA"] } }
```

### 好友消息 inbox（sync-server 持久化）

```jsonc
// server-inbox.json
{ "userA": [ { id, from, fromName, type:"todo"|"remind", payload:{...}, sentAt, read } ] }
```

- 发送方：`POST /api/friends/{me}/send` body `{ to, type, payload, text }`
- 接收方：轮询 `GET /api/friends/{me}/inbox?since=xxx`，新消息在「提醒中心」显示，可一键加入自己的待办/提醒

## 前端改动点

| 位置 | 改动 |
|------|------|
| 侧栏头像区 | 未登录：显示「未登录 · 注册/登录」入口；已登录：显示昵称 + 登出菜单 |
| 新模块 `friends` | 好友列表 + 添加好友 + 发送待办/提醒卡片 |
| 提醒中心 | 新增「来自好友」分区，展示 inbox 消息 |
| 账号面板 | 注册 / 登录 / 切换账号 / 登出，SHA-256 加盐哈希 |
| sync 模块 | 扩展 friends API 调用（send / inbox / graph） |

## 后端改动点（sync-server.js v2）

- `POST /api/auth/register` { username, password, nickname } → { userId, token }
- `GET  /api/friends/{uid}/graph` → 好友列表（含昵称）
- `POST /api/friends/{uid}/add` { friend } / `POST /api/friends/{uid}/remove`
- `POST /api/friends/{uid}/send` { to, type, payload, text }
- `GET  /api/friends/{uid}/inbox?since=` → 消息列表
- 数据文件拆分为 `server-users.json`（图 + 账号）与 `server-inbox.json`（消息）
- 原 `/data` 协议保持不变，账号模式下前端将 token 改为 `{base}::{userId}` 实现服务端按账号隔离

## 质检门禁（每次提交前必须全绿）

1. `node _test_smoke.js` 全部 PASS（新增：账号注册/登录/登出、好友添加、发送待办、inbox 展示断言）
2. 所有 `<script>` 块 `new Function()` 编译通过
3. 顶层 const/let/function 重复声明扫描无冲突
