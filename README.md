# 🌿 个人每日工作台

计划 · 打卡 · 目标 · 记账 · 笔记 —— 零依赖纯前端个人工作台，浏览器打开即用。

## 在线访问

- 电脑版：`workbench-mint.html`（另有 mocha / rose / amber 三套配色）
- 手机版：`workbench-mint-m.html`（底栏 Tab + 抽屉导航 + 浮动按钮）

> GitHub Pages 地址：https://songhonglu.github.io/personal-workbench/workbench-mint.html

## 功能模块

| 模块 | 说明 |
|------|------|
| 今日计划 | 待办勾选 + P0/P1/P2 优先级 |
| 习惯打卡 | 热力图 + 连续天数统计 |
| 长期目标 | 进度环 + 目标进度卡 |
| 记账本 | 收支统计 + 月度支出构成 |
| 随手记 | 灵感 / 摘录 / 复盘 / 生活 |

仪表盘含今日概览环、置顶要事、快速记录、本周习惯追踪表、番茄钟、月度开销等 Bento 卡片。

## 数据说明

- 数据保存在浏览器 `localStorage`（key：`workbench-v1`），换设备 / 清缓存会丢失
- 左下角「导出备份」可导出 JSON；「导入恢复」可还原
- 跨设备实时同步：运行 `sync-server.js`（零依赖 Node 服务），详见 [同步使用说明.md](./同步使用说明.md)

```bash
node sync-server.js   # 默认端口 8788，手机电脑填同一地址与令牌即可共享一份数据
```

## 本地预览

```bash
python3 -m http.server 9000
# 打开 http://127.0.0.1:9000/workbench-mint.html
```
