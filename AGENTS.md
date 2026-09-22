# AGENTS.md — 黑龙江省考 AI 出题 Agent（项目强制约束）

> 本文件对在本仓库内工作的所有 Agent（含 AI 编码工具、子代理集群）具有最高约束力。
> **任何 Agent 开始工作前必须先读本文件**；所有代码、文档、验证行为均不得与本文件冲突。

## 1. 项目一句话

黑龙江省考行测智能刷题 Demo：用户说出/选择练习需求 → Agent 出题（统一结构化 JSON）→ 用户作答 → 系统判题并展示解析。

## 2. 硬性约束（违反即视为任务失败）

- **C1 API Key 隔离**：密钥只允许存在于 `server/.env`（被 .gitignore 排除），严禁写入前端代码、文档或提交进仓库；前端零感知。
- **C2 答案隐藏**：题目答案在用户提交作答前不得渲染进 DOM；内存对象中可以携带，渲染层必须剥离。
- **C3 统一 Schema**：所有前后端数据交互必须使用 `docs/DATA_SCHEMA.md` 定义的统一结构化 JSON；严禁返回整段 Markdown 文本由前端直接展示。
- **C4 Mock 双轨**：所有模型调用必须经 `server/src/services/callLLM.js` 统一封装；无 Key、超时、调用异常时必须回退内置 Mock 题库并让响应携带 `mock: true`，保证闭环永远可演示。禁止把真实 API 调用散落到各文件。**Mock 兜底必须随机化（Wave 10）**：同一参数重复请求不得固定返回同一批题——`getMockQuestions` 随机抽样 + `shuffleOptions` 选项乱序（同步 answer 键与解析「故选 X」声明），观感上每次为新生成；真实 LLM 链路输出天然随机，不做洗牌。
- **C5 不编造事实**：对黑龙江省考具体政策、题型规则不确定时使用通用行测规范，并在界面对话区标注"Demo 范围"；严禁编造官方数据。
- **C6 完成定义**：每个模块必须通过其原子验证（见 §5）才算完成；未验证的模块不得在文档中标记为已完成。

## 3. 目录结构约定

```
demo_01/
├── AGENTS.md                     # 本文件：全局强制约束
├── README.md                     # 运行手册（必须要能照做复现）
├── AI-CODING.md                  # AI 编码过程复盘（必须真实）
├── .gitignore
├── docs/
│   ├── CLUSTERS.md               # 集群配置与各集群原子提示词
│   ├── ARCHITECTURE.md           # 系统架构
│   ├── API.md                    # 接口文档
│   ├── DATA_SCHEMA.md            # 统一数据结构（Schema 权威定义）
│   └── 开发流程_黑龙江省考AI出题Agent.md  # 原始需求拆解与时间评估
├── .agents/
│   └── skills/hlj-kaoqa-dev/SKILL.md   # 二次开发技能（新模块/新题型接入指南）
├── server/                       # 后端 Node.js + Express（ESM）
│   ├── .env.example              # 环境变量模板（含注释）
│   ├── src/
│   │   ├── index.js              # 入口：Express + 中间件 + 路由挂载
│   │   ├── config/env.js         # 环境变量读取与校验
│   │   ├── routes/generate.js    # POST /api/generate（核心出题）
│   │   ├── routes/explain.js     # POST /api/explain（追问讲解）
│   │   └── services/
│   │       ├── parseRequirement.js  # 需求解析：NL 识别 + 默认值
│   │       ├── buildPrompt.js       # Prompt 组装（质量约束 + Schema）
│   │       ├── callLLM.js           # 模型调用封装（超时/重试/异常）
│   │       ├── validateQuestions.js # 四层校验（JSON→字段→答案→一致性）
│   │       └── mockData.js          # 内置 Mock 题库
│   └── scripts/verify-services.js   # 服务层原子验证脚本
└── web/                          # 前端 Vite + Vue 3
    ├── index.html
    ├── vite.config.js            # dev 代理 /api → server
    └── src/
        ├── main.js / App.vue
        ├── api/client.js         # 唯一后端访问入口
        └── components/
            ├── ConfigForm.vue    # 配置表单 + 自然语言输入
            ├── QuestionCard.vue  # 题卡渲染（答案隐藏）
            └── ResultPanel.vue   # 判题结果 / 解析 / 汇总
```

新增文件时保持上述分层；不新增与本结构平行的另一套目录。

## 4. 代码规范

- Node 18+，前后端 JS 均使用 ESM（`import/export`）。
- 命名：变量/函数 `camelCase`，Vue 组件 `PascalCase.vue`，常量 `UPPER_SNAKE_CASE`，私有模块函数带 `_` 前缀。
- 注释密度与周边文件一致；业务文案（中文）原则上抽取为常量/配置，便于统一修改。
- 后端禁止在任何 route 内直接写模型调用或 JSON 解析逻辑，必须走 services 层。
- 前端所有请求必须经 `src/api/client.js`，禁止在组件内拼 fetch URL。
- 不新增大型依赖；确需新增时须在改动说明里给出理由与体积影响。

## 5. 原子验证规范（模块完成定义 DoD）

| 层 | 验证方式 | 通过标准 |
|----|----------|----------|
| 后端 service | `node scripts/verify-services.js` | 断言全绿：解析、校验、Mock、Prompt 结构 |
| 后端接口 | `curl -X POST localhost:3001/api/generate`（无 Key 环境） | 返回合法 JSON，`mock:true`，字段齐全 |
| 前端模块 | `npm run build` + 浏览器走通该模块交互 | build 零错误，交互符合该模块验收 |
| 全链路 | Wave 4 回归清单（见 CLUSTERS.md） | 全部条目通过 |

每个模块完成时：验证输出截图/日志留存在模块说明或 REGRESSION 文档中。

## 6. 文档义务（"一个都不能少"）

- 常驻文档：`README.md`、`AI-CODING.md`、`docs/CLUSTERS.md`、`docs/ARCHITECTURE.md`、`docs/API.md`、`docs/DATA_SCHEMA.md`。
- 接口或数据结构一旦变更，必须同步更新对应文档，再继续开发。
- `README.md` 的"已完成 / 未完成 / 已知限制"必须与真实进度一致，禁止夸大。
- `AI-CODING.md` 必须真实可复盘（用的工具、AI 生成与人工设计的分界、AI 的错误与修正）。

## 7. 常用命令

```bash
# 后端
cd server && npm install && npm run dev        # 监听 3001
# 前端
cd web && npm install && npm run dev           # 监听 5173，/api 代理到 3001
# 服务层验证
cd server && npm run verify                    # 运行 scripts/verify-services.js
# 构建检查
cd web && npm run build
```

## 8. 波次协作规则（集群模式）

- 开发按 `docs/CLUSTERS.md` 定义的波次执行：**Wave 0 文档 → Wave 1 脚手架 → Wave 2 后端 → Wave 3 前端 → Wave 4 联调 → Wave 5 收尾**。
- 波次内集群并行，波次间由主 Agent 验证后放行；**未通过验收的集群不得流入下游波次**。
- 每个集群只做其原子任务清单内的事，不越界重构无关代码。