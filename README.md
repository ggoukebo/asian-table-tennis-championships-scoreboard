# 2026 亚洲乒乓球锦标赛记分板

基于 ITTF 官方结果系统制作的比赛记分板，赛事代码为 `TTE3474`。

> **归档状态**：赛事已于 2026 年结束，本项目于 2026-10-27 归档。源码与查看方式保留，ITTF 后续若关闭赛事数据接口，部分页面可能无法继续获取最新内容。

- 官方结果页：<https://results.ittf.com/ittf-web-results/html/TTE3474/results.html>
- 默认比赛日：浏览器当天；不在赛事日期内时自动选择赛事最后一天
- 生产地址：<http://localhost:3010>

## 功能

- 比赛日、状态、项目、球台筛选
- 球员、协会、轮次和球台搜索
- 点击看板球台在当前页面内打开对应 YouTube 直播
- 实时比赛栏、聚焦比分看板、全屏比赛详情
- 团体赛单盘比分与单项赛逐局比分
- 每 8 秒自动同步 ITTF 官方数据
- 官方接口短时失败时优先使用最近一次成功缓存

## 本地运行

要求 Node.js 22 或更高版本。

```powershell
npm install
npm run dev
```

开发模式地址：

- 前端：<http://localhost:5180>
- API：<http://localhost:3010>

## 生产运行

```powershell
npm run typecheck
npm run build
npm run start
```

打开 <http://localhost:3010>。

如需更换端口：

```powershell
$env:PORT=3011
npm run start
```

## 数据接口

- `GET /api/event`：赛事、日期、项目与场馆信息
- `GET /api/matches?date=2026-10-20`：指定比赛日的赛程、比分与实时比赛
- `GET /api/matches?date=2026-10-20&refresh=true`：跳过服务端短缓存并主动同步
- `GET /api/flag/:code`：协会旗帜代理
- `GET /api/health`：服务健康检查

服务端直接读取 ITTF 的以下 JSON：

- `champ.json`
- `match/live.json`
- `match/dYYYY-MM-DD.json`

比分和阵容以 ITTF 官方现场系统为准。官方尚未公布的单盘或局分不会生成占位比分。
