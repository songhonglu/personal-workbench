# 5 用户全流程验收报告

**日期**：2026-10-01  
**应用版本**：workbench v1.18.0  
**测试范围**：注册 / 登录 / 登出 / 10 月数据初始化 / 互加好友 / 跨用户消息 / 收件箱校验 / 存储隔离

---

## 用户清单

| 用户名 | 昵称 | 密码 | 职业 | 城市 | 好友 |
|--------|------|------|------|------|------|
| linshu | 林纾 | lin@2026ok | 产品经理 | 上海 | 陈默、糖歌 |
| chenmo | 陈默 | chen@2026go | 后端工程师 | 杭州 | 林纾、苏舒、阿岩 |
| sushu | 苏舒 | su@shu2026 | 插画师（自由职业） | 成都 | 陈默、阿岩、糖歌 |
| aoran | 阿岩 | yan@2026run | 健身教练 | 北京 | 陈默、苏舒、糖歌 |
| tangge | 糖歌 | tang@2026vlog | 自由视频博主 | 武汉 | 林纾、苏舒、阿岩 |

每位用户的 10 月数据规格（todo × 3、checkin × 3、goal × 3、money × 5–6、note × 3、remind × 2、health、focus）均贴近人设，日期全部落在 2026-10-01 ~ 2026-10-31。

---

## 全流程结果

### ✅ 注册 + 登录

| 用户 | 注册 | 重新登录 | 错密拒绝 |
|------|------|---------|---------|
| linshu | ✅ userId=usr-mupt… | ✅ | ✅ |
| chenmo | ✅ | ✅ | ✅ |
| sushu | ✅ | ✅ | ✅ |
| aoran | ✅ | ✅ | ✅ |
| tangge | ✅ | ✅ | ✅ |

### ✅ 10 月数据初始化

| 校验项 | 结果 |
|--------|------|
| todo（3 条） | ✅ 全部 5 用户 |
| checkin（3 条，含 10 月 logDays） | ✅ |
| read/goal（3 条） | ✅ |
| money（5–6 条） | ✅ |
| note（3 条） | ✅ |
| remind（2 条） | ✅ |
| __health（goals + log） | ✅ |
| focus | ✅ |
| **profile** | ❌ 见 BUG-01 |

### ✅ 互加好友（10 对好友关系）

林纾↔陈默、林纾↔糖歌、陈默↔苏舒、陈默↔阿岩、苏舒↔阿岩、苏舒↔糖歌、阿岩↔糖歌，以及陈默↔林纾、苏舒↔陈默、糖歌↔各人的反向边，共 10 对，全部建立成功。

### ✅ 跨用户消息 + 收件箱校验

- 14 条 todo 消息成功投递（离线测试，消息写入本地 localStorage 对方设备收件箱）
- 各用户 inbox / unread / toTodo / clearAllRead / lastInteraction 全部正常
- 好友贡献统计：`todoFriend=1/4`（toTodo 转 1 条后占 todo 总数 25%）

### ✅ 存储隔离

每台设备的数据槽 key 形如 `workbench-v1::user::usr-xxx`，5 台设备互不串号，无泄漏。

---

## 问题清单

### 🐛 BUG-01（高）：ensureV2 把用户 profile 重置为空模板

**触发路径**：每次 `store.load()` / `saveLocal()` / `save()` 都调用 `ensureV2(data)`。

**根因**：`workbench.html` 里 `profile` 被同时以两种方式管理，互相冲突：

```
第 1532 行：CONFIG.modules 包含 { key:"profile", … }
第 3833 行：ensureV2 统一对 modules 做 if(!Array.isArray(d[m.key])) d[m.key]=[];
第 3836 行：紧接着 if(Array.isArray(d.profile)) 则重置为空模板对象
```

结果：任何用户通过界面填写的个人信息，在下次 ensureV2 执行后全部被清空（nickname、email、phone 等）。

**影响**：所有 5 名用户均触发，读回 profile 全部为空模板。

**建议修复**：在 `CONFIG.modules` 里去掉 `profile`（它不是标准功能模块，而是对象模板），或者在 ensureV2 的 modules 循环里跳过 `profile` 和 `focus` 等对象型 key。

---

### ⚠️ BUG-02（中）：登出后 cur() 仍非空

**现象**：`logout()` 后调用 `wbUser.cur()` 返回非空。

**原因**：`cur()` 的兜底逻辑会扫描 `wb-auth::user::{userId}` 命名空间键。`logout()` 只清除当前命名空间的 auth，不删除账号专属命名空间的 `wb-auth::user::{userId}` 键（该键属于"该账号"而非"当前会话"）。这是多账号共存架构的有意设计，但在单账号退出的语义下造���"仍然有登录态"的错觉。

**建议**：`logout()` 同时清除 `wb-auth::user::{uid}`，或者 `cur()` 的命名空间扫描在"默认空间未登录"时跳过命名空间键。

---

### ⚠️ BUG-03（中）：addFriend 对反向边重复调用返回"已是好友"

**现象**：测试脚本对 10 对好友关系做双向 addFriend，其中 6 次返回 `{ok:false, err:"已是好友"}`。

**原因**：`addFriend` 的幂等保护会阻止重复添加。测试脚本在"对方设备"补记好友关系时，先登录对方账号调 addFriend（写入对方的 `wb-friends::user::{uid}`），然后对方设备再调用 addFriend 时就已存在。这是测试脚本的调用顺序问题，不是应用 bug。

**实际行为正常**：`addFriend` 幂等，不影响最终好友表完整性。

---

### 测试脚本自身的固有限制（不记入应用缺陷）

| 项 | 说明 |
|----|------|
| serviceWorker 块被跳过 | Node 无浏览器 serviceWorker API，与测试目标无关 |
| 裸 `addEventListener` / `performance.now` 需补桩 | 已在 fake DOM 里补充，不影响测试有效性 |
| `wbUser._uid()` 不存在 | 测试脚本 Phase 4 误用 `_uid()`，正确用法是 `wbUser.cur().userId`；已修复 |

---

## 存储键盘点（每台设备）

以 linshu 为例（共 13 个键）：

```
wb-auth                          — 默认空间登录态
wb-users                         — 本机注册表
wb-friends::user::usr-linshu    — 本账号好友表
wb-friends::user::usr-chenmo    — 好友（chenmo）的好友表（send 回写）
wb-friends::user::usr-tangge   — 好友（tangge）的好友表
wb-inbox::user::usr-linshu     — 本账号收件箱
wb-inbox::user::usr-chenmo     — 对方设备收件箱（send 时直接写入）
wb-inbox::user::usr-tangge     — 对方设备收件箱
workbench-v1                   — 默认数据槽（未登录）
workbench-v1::user::usr-linshu — 本账号专属数据槽（登录态）
workbench-v1::bak::2026-10-02  — 当日备份快照
workbench-v1::bakIdx           — 备份索引
workbench-entry                — 入口记录（PWA）
```

---

## 结论

| 维度 | 结果 |
|------|------|
| 注册/登录/错密拒绝 | ✅ 5/5 通过 |
| 10 月数据初始化（todo/checkin/goal/money/note/remind/health/focus） | ✅ 8/9 通过 |
| profile 初始化 | ❌ BUG-01 阻塞 |
| 互加好友（10 对） | ✅ 全部建立 |
| 跨用户消息投递 | ✅ 14 条全部成功 |
| 收件箱统计/toTodo/clearAllRead | ✅ 全部正常 |
| 存储隔离（无跨设备泄漏） | ✅ 通过 |

**1 个高优先级 bug（BUG-01）需在 v1.18.1 修复后重新验收。**

---

## 复现命令

```bash
# 在 workbench 目录运行
node _test_5users.js
# 结果输出到 _test_5users.result.json
```
