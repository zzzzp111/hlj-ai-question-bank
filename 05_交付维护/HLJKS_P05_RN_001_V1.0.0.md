# 版本说明 (RN)

- **文档标识号**:HLJKS-RN-001-V1.0
- **状态**:BASELINED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22

---

## 1. 发布内容

1.1 黑龙江省考 AI 出题 Agent 演示版(Wave 7 定稿):自然语言 + 可视化表单双入口出题,统一结构化输出,支持作答/判题/解析/学习统计,Apple 风格前端。

1.2 本版本交付物:

| 项 | 位置 |
|---|---|
| 后端(Express/ESM) | `server/` |
| 前端(Vue3/Vite) | `web/` |
| 设计/需求文档 | `.agents/AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/API.md`、`docs/DATA_SCHEMA.md`、`docs/COMPLIANCE.md`、`docs/REGRESSION.md`、`docs/CLUSTERS.md`、根目录 SKILL.md、开发流程文档 |
| A 级文档族(24 份) | `01_立项规划/`~`05_交付维护/` |

## 2. 变更历史

| 版本 | 变更内容 |
|---|---|
| Wave 0~2(基线) | 骨架初始化、双入口与出题链路、结构化输出,答辩流程文档与文档族 01/02 区建立 |
| Wave 3~5(加分) | B1 校验强化双写、B2 排除集去重、R1~R4 健壮性(非法参数 400/防连点/错误归一/空排集回退),11 项建议全过 |
| Wave 6(含 Wave C) | Apple 风格前端重做、按钮原子化(无装饰性控件)、冗余清理 |
| Wave 7(A 级文档族) | 补齐 24 份文档(HLJKS 命名规范)、全量回归(verify 32/32、e2e 8/8、build 101ms)、BUG-001~008 全部 CLOSED |

## 3. 已知问题(详见 README §9)

| # | 问题 | 影响 |
|---|---|---|
| 1 | 真实 LLM 链路未实测(无 Key) | 演示走 Mock 双轨,接入 Key 需回归 |
| 2 | 中文数量词「一道」回落 3 题 | 只识别阿拉伯数字 |
| 3 | explain 路由未接线(B3) | 解析随题面返回,独立解析接口不可用 |
| 4 | Mock 题库分布不均 | 言语 16 / 资料 4 / 判断 3 / 数量 3 / 常识 3 |
| 5 | localStorage 统计按浏览器隔离 | 跨设备不共享 |
| 6 | 无浏览器自动化测试 | 前端视觉靠手工走查(COMPLIANCE §4 声明) |
| 7 | 每题统计粒度(按次作答) | 同题多次作答各记一条,不做去重 |

## 4. 运行环境要求

| 项 | 要求 |
|---|---|
| Node.js | >=18(server/package.json engines) |
| 浏览器 | 现代浏览器(Vue3/Vite 产物) |
| 可选 | `.env` 配置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL(无则 Mock) |

## 5. 安装与启动

5.1 完整步骤见 README §4;摘要:

```bash
# 后端
cd server && npm install && npm run dev   # :3001
# 前端
cd web && npm install && npm run dev       # :3000(proxy /api)
```

5.2 验证:浏览器打开 :3000,双入口均可用;或执行 `cd server && npm run verify && npm run test:e2e`。