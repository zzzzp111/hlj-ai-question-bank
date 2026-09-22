# 软件维护手册 (MNT)

- **文档标识号**:HLJKS-MNT-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22

---

## 1. 系统架构概览

1.1 结构:`web/`(Vue3+Vite,:3000,proxy /api)+ `server/`(Express ESM,:3001)+ 可选 LLM(OpenAI 兼容)+ Mock 双轨。

1.2 内部模块与数据流:见 `docs/ARCHITECTURE.md`、HLJKS-P03-HLD/LLD/IDD。无物理数据库;唯一持久化=浏览器 localStorage(`hlj-kaoqa-stats`)。

1.3 二次开发入口文档(必须阅读):根目录 `AGENTS.md`(强制约束/命名)、`SKILL.md`(技能)、`docs/`(API/DATA_SCHEMA/COMPLIANCE/REGRESSION/CLUSTERS)、HLJKS 文档族(设计与测试)。

## 2. 配置项说明

| 配置 | 位置 | 说明 |
|---|---|---|
| PORT | `server/.env` | 后端端口(默认 3001) |
| LLM_API_KEY | `server/.env` | LLM 密钥;缺失→Mock 兜底(C1:不可进前端) |
| LLM_BASE_URL | `server/.env` | OpenAI 兼容 base URL |
| LLM_MODEL | `server/.env` | 模型名 |
| STATS_KEY | `web/src/stats.js` | localStorage 统计键 `hlj-kaoqa-stats` |

## 3. 日志与验证入口

| 场景 | 命令/位置 |
|---|---|
| 服务层单测 | `cd server && npm run verify`(32 断言) |
| 集成/e2e | `cd server && npm run test:e2e`(8 用例,PORT=3199 自启) |
| 前端构建 | `cd web && npm run build` |
| 服务日志 | 后端启动终端输出;LLM 错误分类 NETWORK/TIMEOUT/API |
| 排除集回退 | 控制台 warn(`console.warn`,generate.js:151) |

## 4. 故障排查流程

| 症状 | 排查步骤 |
|---|---|
| 前端打不开 | Vite 是否启动(:3000);`npm install` 是否完成 |
| 出题报服务不可用 | 后端是否启动(:3001);npm run e2e 自检;检查 proxy |
| 表单参数总是报错 | 核对 ILLEGAL_MODULE/ILLEGAL_COUNT 错误码,参数是否在枚举内 |
| 想要真实 AI 出题 | 检查 .env 三项;verify 里 LLM 路径未 Mock 化,接 Key 后先手工回归 callLLM |
| 统计不准 | 清 localStorage 重试;确认入选区样本数(weakPoints 样本<3 标 insufficient) |
| 题目重复 | 确认「再来一道」走排除集;Mock 库小(29 题)时允许服务端尽力去重 |

## 5. 已知限制对照

5.1 真实 LLM 未实测、中文数字不识别、explain 未接线、Mock 分布不均、无浏览器自动化:详细影响与规避见 HLJKS-P05-RN-001 §3 与 TSR 遗留风险 R-01~R-03。

## 6. 变更与发布规程

6.1 任何结构/接口变更:先改 `docs/DATA_SCHEMA.md` → 同步 IRS/IDD → 更新 RTM 追溯 → 走 SCM 变更流程;生产演示前重跑 verify+e2e。