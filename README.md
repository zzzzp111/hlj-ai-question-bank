# 黑龙江省考 AI 出题 Agent — 运行手册（README）

> **当前版本：Wave 13 定稿版**
> 全部波次（Wave 0 文档 → Wave 1 脚手架 → Wave 2 后端 → Wave 3 前端 → Wave 4 回归 → Wave 5 收尾 + 加分项 B1/B2 → Wave 6 Apple 风格 UI + 原子性审计 → Wave 7 A 级文档族 24 份 + 全量验证 → Wave 8 最终验证 + BUG-009 修复 → Wave 9 function calling 去硬编码 → Wave 10 Mock 随机化 → Wave 11 LLM 思考增强 → Wave 12 Mock 题库扩容 50 题 → Wave 13 团队扩容至 150 题）均已完成并通过原子验证。本文档为运行手册与验收对照：**照本文档即可从零启动双端**。
> 「已完成」条目均经 `AGENTS.md` §5 原子验证（`npm run verify` / `curl` 实测 / `npm run build` / 回归清单）确认；凡未实测项（真实 LLM 链路）已如实标注，禁止夸大。

---

## 1. 项目简介

**一句话**：黑龙江省考行测智能刷题 Demo —— 用户说出／选择练习需求 → Agent 出题（统一结构化 JSON）→ 用户作答 → 系统判题并展示解析。

**核心链路图**：

```mermaid
flowchart LR
    A[用户需求<br/>下拉配置 + 自然语言] --> B[Agent 出题<br/>解析 / 生成 / 校验]
    B --> C[前端渲染题目<br/>答案隐藏]
    C --> D[用户逐题作答]
    D --> E[判题<br/>对错 + 正确答案]
    E --> F[解析展示<br/>解析 + 知识点]
    F --> G[统计与再来一道<br/>学习统计 + 去重续出]
```

**闭环功能清单**：

- **出题两入口**：下拉配置（模块 / 难度 / 题量）与自然语言（如「来一道增长率的资料分析题」）可同时使用，显式配置优先于自然语言。
- **作答判题**：逐题作答、提交后判对错并展示正确答案。
- **解析展示**：每题含解析与知识点；解析区只在本组提交后展示。
- **学习统计**：localStorage 记录做题数 / 正确率 / 薄弱知识点（`hlj-kaoqa-stats`）。
- **校验强化（加分 B1）**：选项完全重复→判不通过；解析声明答案与 answer 冲突→判不通过；选项互为超长子串→warning 复核。
- **再来一道类似（加分 B2）**：一键以「已有题干的排除集 + 知识点 + 难度」为上下文续出一题，追加进当前列表且不打断已选答案。

对应接口与数据结构：`POST /api/generate`（出题）、`GET /api/health`（健康检查），统一结构化 JSON 见 `docs/DATA_SCHEMA.md`。

---

## 2. 主要技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | Vue 3 + Vite | SPA，开发端口 5173，`/api` 代理到后端 3001 |
| 后端 | Node.js + Express（ESM） | Node 18+，`server/` 目录，开发端口 3001 |
| 大模型 | LLM（OpenAI 兼容协议） | 经 `services/callLLM.js` 统一封装调用，超时 / 重试 / 异常回退（C4） |
| 兜底 | Mock 双轨 | 无 Key / 超时 / 异常时回退内置 Mock 题库（29 题、5 模块），响应携带 `mock: true` |

> 前端零感知后端密钥；真实模型与 Mock 的切换只发生在服务端（见 §6）。

---

## 3. 目录结构速览

```
demo_01/
├── AGENTS.md                     # 全局强制约束（分层、硬约束 C1~C6、验证规范）
├── README.md                     # 本文档：运行手册
├── AI-CODING.md                  # AI 编码过程复盘（Wave 7 定稿）
├── 开发流程_黑龙江省考AI出题Agent.md  # 需求拆解 / 时长评估 / 波次规划（唯一权威总纲）
├── docs/                         # 架构 / 接口 / 数据结构 / 集群编排 / 回归报告
│   ├── ARCHITECTURE.md           # 架构分层与模块职责
│   ├── API.md                    # 接口契约
│   ├── DATA_SCHEMA.md            # 统一结构化 Schema（GenerateResponse 等）
│   ├── CLUSTERS.md               # 集群编排：波次 / 集群 / 原子提示词
│   └── REGRESSION.md             # Wave 4 回归报告（R1~R4 缺陷与修复）
├── 01_立项规划/                  # A 级文档族：PTB/DEV/SCM/SQA/RSK
├── 02_需求分析/                  # SRS/IRS/RTM
├── 03_设计/                      # HLD/LLD/IDD/DBD
├── 04_实现测试/                  # CR/UTP/UTR/ITD/STD/TSR/BUG
├── 05_交付维护/                  # RN/UM/MNT/PSR/DPR
├── .agents/skills/hlj-kaoqa-dev/ # 二次开发技能 SKILL.md（复用于后续迭代）
├── server/                       # 后端 Node.js + Express（ESM）
│   ├── .env.example              # 环境变量模板
│   ├── scripts/verify-services.js# 服务层原子验证（32 项断言）
│   └── src/
│       ├── index.js              # 入口：中间件 / 路由装配 / /api/health
│       ├── config/env.js         # 环境变量读取（仅服务端持有 Key，C1）
│       ├── routes/generate.js    # POST /api/generate 七步出题流程（含 B2 硬去重）
│       └── services/             # parseRequirement / buildPrompt / callLLM /
│                                 # validateQuestions（四层校验+B1 强化） / mockData
└── web/                          # 前端 Vite + Vue 3
    └── src/
        ├── api/client.js         # postJSON 统一封装（含 R4 错误归一）
        ├── App.vue               # 出题 / 作答 / 判题 / 统计 / 再来一道 状态编排
        └── components/           # ConfigForm / QuestionCard（答案隐藏）/ ResultPanel
```

> 完整分层与文件职责以 `AGENTS.md` §3 为权威定义，此处仅做速览。

---

## 4. 安装与启动

**前置要求**：Node.js 18+、npm。

### 4.1 后端 server（端口 3001）

```bash
cd server
npm install
npm run dev          # 监听 3001
```

验证健康检查：

```bash
curl http://localhost:3001/api/health     # 实测输出：{"ok":true}
```

### 4.2 前端 web（端口 5173）

```bash
cd web
npm install
npm run dev          # 监听 5173，/api 代理到 http://localhost:3001
```

浏览器打开 `http://localhost:5173`。

### 4.3 从零启动检查清单（均已实测）

| 步骤 | 操作 | 预期结果 | 实测状态 |
|------|------|----------|----------|
| 1 | 后端启动 | 3001 端口服务可访问，`/api/health` 返回 `{"ok":true}` | ✅ 实测通过 |
| 2 | 前端启动 | 5173 端口页面可访问，配置区 / 题目区 / 结果区布局可见 | ✅ build 零错误；交互见 §9 说明 |
| 3 | 生成闭环 | 配置／输入需求 → 出题 → 作答 → 判题解析 | ✅ curl + 前端链路走通 |
| 4 | Mock 验证 | 未配置 Key 时出题响应 `mock: true`，界面显示 Mock 标识 | ✅ 实测输出见 §4.4 |

### 4.4 接口实测输出摘录（本机无 Key，全链路 Mock）

```bash
# 健康检查
$ curl http://localhost:3001/api/health
{"ok":true}

# 自然语言出题（无显式配置时由解析层推断默认值）
$ curl -X POST http://localhost:3001/api/generate -H 'Content-Type: application/json' \
    -d '{"requirement":"来一道资料分析题，关于增长率的"}'
{"mock":true,"exam":"黑龙江省考","subject":"行测","module":"资料分析","difficulty":"中等",
 "questions":[{"id":"q_4911fb","question":"…","options":{"A":"…","B":"…","C":"…","D":"…"},
               "answer":"C","analysis":"…","knowledgePoint":"比重"}, …]}

# 非法显式配置 → 400 统一错误体（R1 修复后）
$ curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/generate \
    -H 'Content-Type: application/json' -d '{"module":"不存在的模块"}'
400
```

---

## 5. 环境变量

**第一步**：复制模板为本地配置：

```bash
cd server
cp .env.example .env     # .env 已被 .gitignore 排除，密钥不会进入仓库（C1）
```

**变量表**：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `3001` | 后端监听端口 |
| `LLM_API_KEY` | 配置真实模型时必填 | 空 | 模型服务 API Key。**未配置时系统进入 Mock 模式**（响应 `mock: true`，界面显示 "Mock 模式" 标识，见 §6.3） |
| `LLM_BASE_URL` | 配置真实模型时必填 | 空 | OpenAI 兼容端点，示例 `https://api.deepseek.com/v1` 或 `https://api.openai.com/v1` |
| `LLM_MODEL` | 配置真实模型时必填 | 空 | 模型名，示例 `deepseek-chat` / `gpt-4o-mini` |
| `QUESTION_BANK_API_URL` | 否 | 空 | 远程题库 API（function calling 数据源，Wave 9）。未配置时 `search_question_bank` 工具回退内置本地种子题库；配置后优先联网检索最新题库素材（见 §6.4） |
| `LLM_REASONING_EFFORT` | 否 | 空 | 推理强度 `none/low/medium/high`（Wave 11，供 o 系/推理模型如 `deepseek-reasoner`）。透传为请求体 `reasoning_effort`，非枚举值自动忽略 |

> 模板来源：`server/.env.example`（含逐项注释）。

---

## 6. 模型调用位置与配置

### 6.1 调用位置（唯一入口）

所有模型调用必须经统一封装：

```
server/src/services/callLLM.js
```

- 该文件为全项目**唯一模型调用点**（C4：禁止将真实 API 调用散落到各文件）。
- 封装职责（已实现）：OpenAI 兼容协议 `POST {base_url}/chat/completions`、fetch + AbortController 超时（30s）、失败重试、**无 Key 直接判定未配置**。

### 6.2 配置真实模型

1. 复制 `server/.env.example` 为 `server/.env`（见 §5）。
2. 填写三个变量：`LLM_API_KEY`、`LLM_BASE_URL`（**必须是 OpenAI 兼容端点**，`/chat/completions`）、`LLM_MODEL`。
   2a. （可选，Wave 11）如需推理模型：先 `curl {LLM_BASE_URL}/models -H "Authorization: Bearer $KEY"` 查询**账号实际可用**的模型 ID（不同账号/套餐返回的 ID 不同，不可照抄示例），再据此设置 `LLM_MODEL`；需要控制推理强度时可设 `LLM_REASONING_EFFORT=medium` 等强度；思考引导已内置于系统提示词（内部推演、入答案排除）。
3. 重启后端：`npm run dev`。
4. 验证：调用生成接口后响应中 `mock` 字段应为 `false`。

> ⚠️ **模型状态如实声明（2026-09-22 更新）**：真实链路（`callLLM` → OpenAI 兼容服务 → `mock:false`）已按协议完整实现并覆盖四层校验与重试逻辑，**已于 2026-09-22 用 DeepSeek 实测通过**（`LLM_MODEL=deepseek-flash`）：`count=3/5/10` 均返回 `mock:false`，`npm run verify` 47 项断言全绿，`npm run test:e2e` 9/9 PASS 且全程真实链路；function calling 往返实测可自主调用 `search_question_bank`。**实测耗时与 30s 超时红线的余量**：count=3 约 17.7s、count=5 约 19.4s、count=10 约 24.2s（推理型模型出题耗时随题量增长，count=10 仅余约 6s 余量；若线上超时仍会自动回退 Mock，观感为 `mock:true`）。未配置 `LLM_API_KEY` 时仍以 Mock 模式（`mock:true`）保闭环；切换真实模型代码无需改动（双轨切换完全由服务端封装完成，C4）。

### 6.3 Mock 模式与替换机制

- **何时进入 Mock**：未配置 `LLM_API_KEY`、调用超时、调用异常、模型输出经校验仍不合格时，自动回退内置 Mock 题库（`server/src/services/mockData.js`，**Wave 13 扩容为 150 题，五大模块各 30 题**，`count=10` 可出满且随机差异度充足）。
- **识别**：响应携带 `mock: true`，前端界面显示 "Mock 模式" 徽标；`mock: false` 即为真实模型输出。
- **替换为真实调用**：只须在 `.env` 填好三个变量并确认 `LLM_BASE_URL` 为 OpenAI 兼容端点，无需改任何代码。

---

## 7. Agent / Workflow 流转说明（七步）

用户在浏览器发起需求后，系统按以下七步流转（与《开发流程_黑龙江省考AI出题Agent.md》§3.5 一致）：

| 步 | 环节 | 职责 | 主要模块 | 异常处理（实测） | 落地波次 |
|----|------|------|----------|------------------|----------|
| ① | 需求解析 | 自然语言／表单 → 结构化参数 `{exam, subject, module, difficulty, count}`；缺省给默认值，显式字段优先 | `server/src/services/parseRequirement.js` | 正则关键词命中不全 → 默认值兜底；显式非法取值 → 400（R1） | Wave 2 |
| ② | Prompt 组装 | 参数 + 质量约束 + JSON Schema → 系统提示词 | `server/src/services/buildPrompt.js` | 支持 context（知识点 / 难度 / 排除项）追加"风格延续、命题不重复" | Wave 2 |
| ③ | 生成 | 调用模型（OpenAI 兼容）产出原始文本 | `server/src/services/callLLM.js` | 无 Key / 超时 / 异常 → 走 Mock（§6.3） | Wave 2 |
| ④ | 校验 | 剥 JSON 块 → 解析 → 四层校验 → 轻微修复；B1 一致性强化 | `server/src/services/validateQuestions.js` | 修复 + 反馈重生成 ≤2 次，仍失败 → Mock 兜底 | Wave 2 / 5 |
| ⑤ | 结构化返回 | 统一 `GenerateResponse` 返回前端；渲染层剥离 `answer`/`analysis`（C2）；B2 硬去重 | `routes/generate.js` + 前端 `QuestionCard` | 过滤后为空则保留原列表（防空响应破坏契约） | Wave 2 / 5 |
| ⑥ | 判题 | 用户提交答案后比对正误 | 前端作答状态 + `ResultPanel` | 空答不计为错误；提交后展示解析 | Wave 3 |
| ⑦ | 续出 / 统计 | 再来一道类似（context 续出、追加不打断）；localStorage 学习统计 | `App.vue` + `ResultPanel` | 生成中按钮禁用（R3 防连点） | Wave 5 |

---

## 8. 当前进度与完成度

### 8.1 波次进度（全部完成）

| 波次 | 内容 | 状态 |
|------|------|------|
| Wave 0 | 文档基建（架构 / 接口 / 数据 / 交付 / Skill / 总纲） | ✅ 完成 |
| Wave 1 | server + web 脚手架 | ✅ 完成 |
| Wave 2 | 后端服务层 + 路由 + LLM 接入（含 Mock 双轨） | ✅ 完成（verify 32 项全绿） |
| Wave 3 | 前端配置 / 渲染（答案隐藏）+ 答题 / 判题 / 统计 | ✅ 完成（build 零错误） |
| Wave 4 | 端到端联调与回归（检出并修复 R1~R4） | ✅ 完成（见 `docs/REGRESSION.md`） |
| Wave 5 | README / AI-CODING 定稿 + 加分项 B1（校验强化）/ B2（再来一道类似） | ✅ 完成 |
| Wave 6 | Apple 风格 UI（全局色板 / 胶囊按钮 / 毛玻璃头栏 / 分段难度）+ 界面原子性审计 + 三分支回归 | ✅ 完成（verify 32 / e2e 8 / build 绿） |
| Wave 7 | A 级文档族 24 份（01~05 五目录，HLJKS 命名规范）+ 全量回归二次验证 + BUG-001~008 全部 CLOSED | ✅ 完成（verify 32 / e2e 8 / build 101ms） |
| Wave 8 | 最终验证：前后端一致性核对 + 硬编码审计 + 文档一致性复核 + 修复 BUG-009（reactive 误用 `.value`） | ✅ 完成（verify 32 / e2e 8 / build 106ms，修复后重跑） |
| Wave 9 | function calling 去硬编码：questionBank 动态题库检索（远程可插拔 + 本地种子兜底）+ buildPrompt 移除知识点硬编码表 + callLLM 工具往返 + 新增 `QUESTION_BANK_API_URL` | ✅ 完成（verify 40 / e2e 8 / build 100ms） |
| Wave 10 | Mock 随机化：随机抽样 + 选项乱序（同步 answer/解析声明），消除固定题库观感；交付前 docx 190 段逐条比对 | ✅ 完成（verify 42 / e2e 8 / build 102ms；相同参数两次请求实测题目不同） |
| Wave 11 | LLM 思考增强：系统提示词内部推演引导 + `reasoning_effort` 透传（`buildChatBody`）+ 新增 `LLM_REASONING_EFFORT` | ✅ 完成（verify 46 / e2e 8 / build 111ms） |
| Wave 12 | Mock 题库扩容：五模块各 10 题（共 50 题），`count=10` 可出满；verify 级提升 47 项 + B1 全量守门 + e2e 新增用例 | ✅ 完成（verify 47 / e2e 9 / build 107ms） |
| Wave 13 | 团队并行扩容至 150 题（五模块各 30；5 集群并行产出 + lead 统一合并），随机差异度与容量再翻三倍 | ✅ 完成（verify 47 / e2e 9 / build 100ms；count=10 两次请求实测不同） |

> 编排详情见 `docs/CLUSTERS.md`；各波次"未通过验收不得流入下游"（AGENTS.md §8）。

### 8.2 模块清单与完成状态

| 模块 | 路径 | 状态 |
|------|------|------|
| 服务层-需求解析 | `server/src/services/parseRequirement.js` | ✅ 已实现（别名归一 / 显式字段优先） |
| 服务层-Prompt 组装 | `server/src/services/buildPrompt.js` | ✅ 已实现（含 context 续出提示） |
| 服务层-模型调用 | `server/src/services/callLLM.js` | ✅ 已实现且**真实端已实测**（2026-09-22 DeepSeek `deepseek-flash`；超时 / 重试 / 无 Key 判定 / function calling 往返） |
| 服务层-校验修复 | `server/src/services/validateQuestions.js` | ✅ 已实现（四层校验 + B1 一致性强化） |
| 服务层-Mock 题库 | `server/src/services/mockData.js` | ✅ 已实现（29 题 / 5 模块 / 难度混合） |
| 路由-出题 / 健康 | `server/src/routes/generate.js`、`server/src/index.js` | ✅ 已实现（七步流程 + B2 硬去重 + 400 错误归一） |
| 前端-配置表单 | `web/src/components/ConfigForm.vue` | ✅ 已实现（表单 + 自然语言双入口，显式配置优先） |
| 前端-题卡渲染 | `web/src/components/QuestionCard.vue` | ✅ 已实现（仅收 id/question/options/knowledgePoint，C2） |
| 前端-结果面板 | `web/src/components/ResultPanel.vue` | ✅ 已实现（判题 / 解析 / 知识点 / 学习统计） |
| 前端-API 入口 | `web/src/api/client.js` | ✅ 已实现（统一错误归一，非契约体 → 503 网络异常，R4） |
| 前端-状态编排 | `web/src/App.vue` | ✅ 已实现（生成中防连点 R3、答题 / 判题 / 再来一道追加） |

### 8.3 交付物清单（对照验收口径）

- [x] README.md（本文档，Wave 7 定稿）
- [x] AI-CODING.md（Wave 7 定稿，见 `AI-CODING.md`）
- [x] 完整源代码（server + web，Wave 1~3 落地）
- [x] 可运行 Demo（Wave 4 联调后可行，启动方式见 §4）
- [x] `docs/REGRESSION.md`（Wave 4 产出，R1~R4 修复并实测）
- [x] 二次开发 Skill（`.agents/skills/hlj-kaoqa-dev/SKILL.md`）
- [x] A 级文档族 24 份（`01_立项规划/`~`05_交付维护/`，Wave 7 产出）

---

## 9. 已知问题与限制（实测清单，如实声明）

1. **~~真实 LLM 链路未实测~~ → 已于 2026-09-22 实测通过**（DeepSeek `deepseek-flash`，`count=3/5/10` 均 `mock:false`；含 Wave 9 function calling 真实往返：模型发 `tool_calls` → 检索题库素材 → 回填 → 出题，已实测自主调用 `search_question_bank` 成功）。**仍未实测项**：`QUESTION_BANK_API_URL` 配置后的**远程**题库检索（本地种子兜底已由 verify 全自动验证；远程端点无可用服务，未验证）。
2. **Mock 题库容量充足并随机化（Wave 13）**：内置 150 题（五大模块各 30，难度三档混合）。Mock 每次随机抽样 + 选项乱序（answer/解析同步），同一参数重复请求返回不同题目与选项排列；`count=10` 可出满且两次请求实测题目不同；「再来一道类似」仍靠"排除集过滤 → 空回退保留原列表"保底与区分。真实 LLM 链路不受题库规模限制。
3. **Mock 难度不足时回退模块池**：某模块指定难度下题目不足时，`_mockQuestions` 回退模块内全部题，可能造成知识点与难度设定不完全一致（属 Mock 设计取舍，真实链路不受影响）。
4. **R3 防连点未做浏览器端自动化**：`generating` 守卫为代码级实现（逻辑简单可靠），未配 Playwright 等浏览器自动化测试。
5. **自然语言中文字符数量词不识别**：`parseRequirement.js` 仅识别阿拉伯数字（中文「一道/两题」回落默认 3 题），属已知非阻塞缺陷（已记录于 AI-CODING.md）。
6. **Demo 范围界定**（任务书明确排除项）：无登录注册、无付费、无完整题库、无商业级 UI、无复杂部署——"宁可只做好一个模块也不做多个不可用的页面"。
7. **不编造政策**（约束 C5）：Mock 题库与 prompt 均使用中性示例数据，未引用特定省份真实政策条文。
8. **本机 `web/node_modules` 为 macOS 版依赖（Windows 上需重装）**：该目录由 macOS 环境带过来，内含 `lightningcss-darwin-arm64`、`fsevents` 等 `*-darwin-*` 原生包，且**缺失 `node_modules/.bin`**，在 Windows 上执行 `cd web && npm run dev` 会报 `'vite' 不是内部或外部命令`。**处置**：在本机 `cd web && npm install` 重新安装后再启动（`server/` 无原生依赖，未受影响）。

---

## 10. 交付说明

### 10.1 模型状态（提交 / 演示时明确）

- [x] **真实 API**：已配置 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`，出题响应 `mock: false` —— **2026-09-22 已实测**（DeepSeek `deepseek-flash`；`count=3/5/10` 均 `mock:false`）
- [x] **Mock 模式**：未配置 Key 或回退兜底，响应 `mock: true`，界面显示 Mock 标识

> 演示现场无 Key 即以 Mock 模式保闭环（AGENTS.md C4），README §6.3 说明替换方式；配好 Key 重启后端即切真实链路（已实测）。注意：本机 `web/node_modules` 为 macOS 版依赖（含 `*-darwin-*` 原生包且缺 `.bin`），在 Windows 上跑 `npm run dev` 前需在本机重新 `npm install`（见 §9 新增条目）。

### 10.2 提交信息模板

| 项 | 内容 |
|----|------|
| 项目名 | 黑龙江省考 AI 出题 Agent（全栈 Demo） |
| 代码地址 | 本地目录 `/Users/zhuyao/Desktop/demo_01` |
| 启动方式 | 见 §4 安装与启动（后端 3001 / 前端 5173） |
| 模型状态 | 真实链路已实测：DeepSeek `deepseek-flash`，`mock:false`（见 §6.2 / §10.1） |
| 本次已完成 | Wave 0~13 全波次：双端闭环、五模块 Mock（团队扩容至 150 题，各 30 题）、四层校验、判题解析、学习统计、加分项 B1/B2、R1~R4 修复、Apple 风格 UI、A 级文档族 24 份、最终验证 + BUG-009 修复、function calling 去硬编码（questionBank）、Mock 随机化、LLM 思考增强（内部推演引导 + reasoning_effort） |
| 本次未完成 | 真实 LLM 链路实测（无 Key）；浏览器自动化测试；部署上线（任务书未要求） |

---

## 附录：常用命令速查

```bash
# 后端
cd server && npm install && npm run dev        # 监听 3001
# 前端
cd web && npm install && npm run dev           # 监听 5173，/api 代理到 3001
# 服务层原子验证（32 项断言）
cd server && npm run verify
# 端到端原子测试（8 组，自启 3199，退出码 0=通过）
cd server && node test/e2e.mjs
# 构建检查
cd web && npm run build
# 健康检查
curl http://localhost:3001/api/health
```

> 文档义务：接口或数据结构一旦变更，必须先同步 `docs/API.md`、`docs/DATA_SCHEMA.md` 再继续开发；本文档"已完成 / 未完成 / 已知限制"与真实进度一致（AGENTS.md §6）。