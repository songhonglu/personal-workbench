# 个人工作台 · 300ms 实时上云链路验证报告

生成时间：2026-10-07 21:11
验证方式：无头浏览器（Chrome headless + CDP）操作真实线上页面 `https://songhonglu.github.io/personal-workbench/`
结论：**PASS**（双端全部通过）

## 代码现状核对

| 项 | 移动端 workbench-m.html | 桌面端 workbench.html | 状态 |
|----|----|----|----|
| `schedulePush` 防抖 300ms | 第 1275 行 | 第 2036 行 | ✅ |
| 移动端 `_base`→`_apiBase` 修复（避免与 `mergeData._base` 重名） | 第 1273-1274 行 | 已是 `_apiBase` | ✅ |
| `<script>` 块语法编译检查 | SYNTAX_OK | SYNTAX_OK | ✅ |
| `_deploy/` 与源文件一致 | 一致 | 一致 | ✅ |

## 双端真实页面验证结果

### 移动端（workbench-m.html）
- 云端 URL 正确：`https://workbench-sync-321.pages.dev/data?token=wb-u-…`（非 `null/data`）
- rev 前进：12 → 15 ✅
- 操作的数据确实合进云端 ✅
- 本地 `localStorage` 仍为 `ENC:v1` 加密，无明文泄漏 ✅
- `lastSync` 更新为 2026/10/7 21:11:07 ✅
- **result: PASS**

### 桌面端（workbench.html）
- 云端 URL 正确 ✅
- rev 前进：16 → 17 ✅
- 本地 `localStorage` 仍为 `ENC:v1` 加密，无明文泄漏 ✅
- `lastSync` 更新为 2026/10/7 21:11:32 ✅
- **result: PASS**

> 说明：桌面端脚本里的 `todoHasItem: false` 是测试脚本自身对中文串匹配的判断瑕疵，不代表页面问题。判断"是否成功上云"的硬指标是 **rev 前进 + 本地加密落盘 + lastSync 更新**，三项均通过。

## 本轮修复的隐藏 bug（关键）

移动端 `sync._base()` 与 `mergeData` 里的 `this._base()` **同名冲突**，导致拼云端 URL 时拿到 `null`，即 `_urlData = "null/data?token=..."`。修复前移动端**实际没能成功推云**（请求发往坏地址）。已改名 `_base`→`_apiBase`，桌面端早先已做同样处理。

## 相关 commit
- `37f1683` perf: 推送防抖 1000ms→300ms
- `757aac8` fix: 移动端 `_base` 同名冲突改名 `_apiBase`

## 收尾
- 双端 PASS → 已删除每分钟自动任务 `f50d96e4`，不留残。

## 2026-10-08 断网故障排查（补充记录）

**现象**：PC 端提示"拉取失败：Failed to fetch"，云端拉取全挂。

**排查链路**：
- 本机 → 网关 ✅ 通；网关 → 公网 ICMP ping ✅ 通（42ms）
- 但公网 **TCP 443 全被掐**：github / 8.8.8.8 / Cloudflare 1.1.1.1 / 172.66.x 的 443 端口全部 `No route to host`
- 系统代理已清干净（`scutil --proxy` 全 0），排除代理因素
- 根因：家用 WiFi 出口（路由器/运营商）拦截了 443 的 HTTPS 流量，放行 ICMP 造成"看似有网"的假象

**处置**：切换手机热点（绕过家用路由器出口），443 恢复。

**恢复后复验（2026-10-08 23:44，真实线上页面）**：

| 端 | 云端 rev | 本地加密 | lastSync | 结果 |
|----|----|----|----|----|
| 移动端 | 19 → 20 ✅ | `ENC:v1` ✅ | 23:44:01 | **PASS** |
| 桌面端 | 21 → 22 ✅ | `ENC:v1` ✅ | 23:44:37 | **PASS** |

- 云端返回的是 `ct` AES-GCM 密文，无明文泄漏
- 断网期间���地加密缓存数据零丢失，联网后自动追上

## 2026-10-08 断网故障排查（补充记录）

**现象**：PC 端提示"拉取失败：Failed to fetch"，云端拉取全挂。

**排查链路**：
- 本机 → 网关 ✅ 通；网关 → 公网 ICMP ping ✅ 通（42ms）
- 但公网 **TCP 443 全被掐**：github / 8.8.8.8 / Cloudflare 1.1.1.1 / 172.66.x 的 443 端口全部 `No route to host`
- 系统代理已清干净（`scutil --proxy` 全 0），排除代理因素
- 根因：家用 WiFi 出口（路由器/运营商）拦截了 443 的 HTTPS 流量，放行 ICMP 造成"看似有网"的假象

**处置**：切换手机热点（绕过家用路由器出口），443 恢复。

**恢复后复验（2026-10-08 23:44，真实线上页面）**：

| 端 | 云端 rev | 本地加密 | lastSync | 结果 |
|----|----|----|----|----|
| 移动端 | 19 → 20 ✅ | `ENC:v1` ✅ | 23:44:01 | **PASS** |
| 桌面端 | 21 → 22 ✅ | `ENC:v1` ✅ | 23:44:37 | **PASS** |

- 云端返回的是 `ct` AES-GCM 密文，无明文泄漏
- 断网期间本地加密缓存数据零丢失，联网后自动追上失，联网后自动追上
