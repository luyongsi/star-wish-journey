# 心愿拾光 — 交付概览

## TL;DR

情侣愿望池微信小程序「心愿拾光」：v1.0 完成核心闭环，v1.1 补齐「身份 / 打卡减负 / 回访钩子」三个漏点，并加入回忆 Tab（时间线 / 成就 / 足迹地图）与年度报告。231 个测试用例全部通过。

## 版本与状态

| 版本 | 范围 | 状态 |
|-|-|-|
| v1.0 | 贴贴绑定、愿望池 CRUD、随机抽取、打卡、回忆录时间线 | 已上线 |
| v1.1 | 11 项需求（见下），5 Tab + 12 个子页面 | 已实现，待真机验证 |

- ✅ 231 个测试用例 100% 通过
- ⚠️ 地图与 canvas 长图只能在开发者工具 / 真机验证，本地单测覆盖不到

## 技术栈

微信小程序原生 WXML/WXSS/JS + 微信云开发（CloudBase：云函数 + 云数据库 + 云存储）

## v1.1 新增功能

| 编号 | 功能 | 关键实现 |
|-|-|-|
| FUN-1 | 个人资料设置 | `pair` 云函数 `updateProfile` / `anniversary`；「我的 → 编辑资料」 |
| FUN-2 | 打卡减负 | 备注 / 媒体 / 位置全部选填；`complete` 可跳过内容；`append` 支持一个愿望多条记录 |
| FUN-3 | 抽取增强 | 分类筛选 + 避开近期（阶梯放宽）+ 收藏权重 3 倍 |
| FUN-4 | 愿望计划日期 | `wishes.plannedDate`；打卡页「今天要做」分区；逾期标记 |
| FUN-5 | 每日一抽 | `dailyDraws` 集合，幂等键 `coupleId_YYYY-MM-DD`；就今天 / 换一个（≤3 次）/ 明天再说 |
| FUN-6 | 对方动态与红点 | `utils/badge.js` + `wx.setTabBarBadge`；仅站内，不含订阅消息 |
| FUN-7 | 参考图与双视图 | `wishes.coverUrl`；愿望池列表 / 瀑布切换（瀑布长按出编辑删除） |
| FUN-8 | 足迹地图 | `wx.chooseLocation` 采集 + `utils/location.js` 城市解析 + `utils/map.js` 缩放计算；回忆 → 足迹 |
| FUN-9 | 愿望灵感库 | `data/inspiration.js` 内置 40 条模板，一键入库 |
| FUN-10 | 成就体系 | `memory` 云函数 `achievements`，12 项按情侣维度计算 |
| FUN-11 | 年度报告 | `memory` 云函数 `annualReport`；canvas 2d 生成长图保存相册 |

## 项目结构

```
├── miniprogram/
│   ├── app.js/json/wxss       # 入口、5 个 TabBar、全局红点刷新
│   ├── config/                # 环境配置、媒体限制
│   ├── data/inspiration.js    # 40 条愿望模板
│   ├── utils/                 # constants / request / store / format / validator
│   │                          # realtime / date / location / map / badge
│   ├── services/              # auth / pair / wish / checkin / media / memory
│   ├── components/            # wish-card / checkin-card / draw-animation
│   │                          # media-uploader / category-tag / empty-state / today-wish
│   └── pages/
│       ├── pool/index         # 愿望池（列表 / 瀑布 + 今日入口 + TA 动态）
│       ├── wish/detail        # 愿望详情 / 编辑 / 追加记录
│       ├── inspiration/index  # 愿望灵感库
│       ├── draw/index         # 抽取（今日愿望 + 条件 + 结果）
│       ├── checkin/index      # 打卡（今天要做 / 待打卡 / 已完成）
│       ├── checkin/detail     # 打卡详情（回忆详情同页）
│       ├── memory/index       # 回忆（时间线 / 成就 / 足迹）
│       ├── memory/report      # 年度报告 + 长图
│       ├── profile/index      # 我的
│       ├── profile/edit       # 编辑资料
│       ├── profile/settings   # 设置
│       └── pair/bind          # 贴贴绑定
├── cloudfunctions/
│   ├── login/                 # 登录（含 partner）
│   ├── pair/                  # 贴贴 + 资料 + 纪念日
│   ├── wish/                  # 愿望 CRUD / 抽取 / 今日一抽 / 计划日期
│   ├── checkin/               # 打卡 / 完成 / 追加 / 三分区列表
│   ├── memory/                # 时间线 / 足迹 / 成就 / 年度报告
│   └── stats/                 # 统计（P2）
├── tests/                     # 测试（含 v11.test.js 与 utils 单测）
├── docs/                      # v1.0 PRD 与架构文档
└── outputs/                   # v1.1 PRD 与线框图（不入库）
```

## 数据库集合

| 集合 | v1.1 变更 |
|-|-|
| `users` | 开始写入 `nickName` / `avatarUrl` |
| `couples` | 新增 `boundAt`（纪念日回退基准） |
| `wishes` | 新增 `plannedDate` / `coverUrl` / `checkInCount` / `lastCheckInAt` / `returnedAt` |
| `checkins` | 新增 `isAppend` / `location`；`wishId` 不再唯一（一个愿望可多条） |
| `dailyDraws` | **新增**，`_id = coupleId_YYYY-MM-DD` |

## 部署清单

1. 微信开发者工具打开项目，确认 AppID 与 `miniprogram/config/index.js` 的 `envId`
2. 云数据库创建集合：`users`、`couples`、`wishes`、`checkins`、`dailyDraws`
3. 建立索引：
   - `wishes`：`(coupleId, status)`、`(coupleId, createdAt)`、`(coupleId, plannedDate)`
   - `checkins`：`(coupleId, wishId)`、`(coupleId, createdAt)`
   - `dailyDraws`：`_id` 天然唯一，无需额外索引
4. 配置安全规则（共享集合 `read: auth.openid in doc.members`，`write: false`）
5. 上传部署 6 个云函数
6. 真机验证：地图足迹、年度报告长图、位置授权、TabBar 红点
