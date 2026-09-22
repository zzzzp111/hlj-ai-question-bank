# ARCHITECTURE.md — 系统架构

> 本文档是「黑龙江省考 AI 出题 Agent」全栈 Demo 的架构权威说明，是代码评审与后续开发的依据。
> 约束基线：`../AGENTS.md`（硬性约束 C1~C6）；接口与数据字段以 `docs/API.md`、`docs/DATA_SCHEMA.md` 为准（与本文档同属 Wave 0 并行产出，如尚未生成，以 `../CLUSTERS.md` 第 2 节与根目录《开发流程_黑龙江省考AI出题Agent.md》第 3.3/3.4 节定义的结构为准）。
> 状态标识：本文档描述 **目标架构 + Wave 0~5 实现计划**；「已完成 / 未完成」以 `../README.md` 与 `docs/REGRESSION.md` 的真实进度为准（C6：未通过原子验证的模块不得标记为完成）。

---

## 1. 总体视图与分层架构

系统为三层单页应用架构：**前端 SPA（Vue 3）→ 后端 API（Node + Express）→ 模型服务（LLM / Mock 双轨）**。
前端零感知任何密钥（C1）；答案在作答前不进入渲染层（C2）；前后端全部交互为统一结构化 JSON（C3）；所有模型调用只经 `callLLM.js` 封装（C4）。

| 层 | 技术 | 入口 / 容器 | 职责 | 关键约束 |
|----|------|-------------|------|----------|
| 前端 SPA | Vue 3 + Vite | `web/`，dev 端口 5173，`/api` 代理到 3001 | 配置/自然语言输入 → 出题调用 → 题目渲染（答案隐藏）→ 作答 → 判题 → 结果/解析/统计 | 所有请求经 `src/api/client.js`，组件禁拼 fetch URL；答案在提交前不进 DOM |
| 后端 API | Node 18+ / Express（ESM） | `server/`，监听 3001 | 接收请求 → 组装参数 → 出题 → 校验兜底 → 返回 GenerateResponse | route 禁写模型调用与 JSON 解析逻辑，全部走 services；统一错误格式 `{error:{code,message}}` |
| 模型服务 | LLM（OpenAI 兼容）/ Mock 双轨 | 由 `services/callLLM.js` 统一封装 | 真实出题 / 兜底出题 | 无 Key、超时、调用异常一律回退 Mock 并携带 `mock:true` |

### 1.1 前端 SPA（`web/src/`）

```
web/src/
├── main.js / App.vue          # 应用装配 + 三区块布局（标题栏含 Mock 徽标 / 配置区 / 题目区 + 结果区）
├── api/
│   └── client.js              # 唯一后端访问入口：postJSON(path, body, timeoutMs=30000)
│                              # 封装 fetch、AbortController 超时、错误归一化为 {error:{code,message}}
└── components/
    ├── ConfigForm.vue     # 出题配置：地区/考试/科目固定值 + 模块/难度/题量下拉 + 自然语言 textarea + 生成按钮（防重复）
    ├── QuestionCard.vue   # 题卡：题干 + A-D 选项（可点选高亮）+ 知识点标签；只收 {id,question,options,knowledgePoint}
    └── ResultPanel.vue    # 判题结果：对/错 + 正确答案 + 解析（仅提交后展示）+ 本组汇总 + 学习统计
```

职责边界：

- **组件只关心展示与交互**；后端通信全部收敛到 `api/client.js`（不加新依赖，Vue 组件不直连 fetch）。
- **答案隐藏是渲染层硬约束（C2）**：`QuestionCard.vue` 的 props 白名单只含 `id / question / options / knowledgePoint`，`answer` 与 `analysis` 严禁传入、严禁渲染。完整数据（含 answer/analysis）由 `App.vue` 持有于内存，仅当用户提交作答后才下发展示。
- **Mock 标识**：`App.vue` 依据响应 `mock` 字段展示「Mock 模式」徽标与 Demo 范围说明（C5）。

### 1.2 后端 Express（`server/src/`）

```
server/src/
├── index.js                 # 入口：express + cors + express.json + 路由挂载 + 全局错误中间件 + 404 兜底
├── config/env.js            # 读取环境变量并给默认值，Key 缺省不抛错（无 Key 场景由上层走 Mock）
├── routes/
│   ├── generate.js          # POST /api/generate 核心出题：组装参数 → 调 services → 校验兜底 → 响应
│   └── explain.js           # POST /api/explain 追问讲解（B3；无 Key 时模板重述，有 Key 调 LLM）
└── services/
    ├── parseRequirement.js  # 需求解析：NL 识别 + 默认值 + 显式字段覆盖 + 模块白名单
    ├── buildPrompt.js       # Prompt 组装：出题人角色 + 工具检索指引 + JSON Schema + 质量约束（Wave 9 去硬编码）
    ├── callLLM.js           # 模型调用封装：OpenAI 兼容 /chat/completions，30s 超时 + 重试 1 次 + function calling(tools 往返) + 统一抛错
    ├── validateQuestions.js # 四层校验：剥 JSON → 结构 → 逐题字段 → 一致性；轻度修复
    ├── mockData.js          # 内置 Mock 题库（≥3 模块 × ≥3 道，格式严格符合 DATA_SCHEMA）+ mockBank 元数据
    └── questionBank.js      # 题库检索服务（function calling 数据源）：远程 API 优先 + 本地种子兜底（Wave 9）
```

分层规则（`AGENTS.md` §4）：

- **routes ⇄ services 单向依赖**：route 只做参数装配与响应组装，模型调用、JSON 解析、校验逻辑一律下沉 services；禁止在 route 内嵌业务逻辑。
- **模型调用唯一通道**：全仓仅 `callLLM.js` 可发起真实模型请求（C4），禁止把真实 API 调用散落到各文件。
- **统一错误出口**：全局错误中间件输出 `{error:{code,message}}`，错误码见 `docs/API.md`（400 参数错 / 408、503 模型超时或不可用 / 500 未知）。

### 1.3 services 五模块职责（评审核对点）

| 模块 | 职责 | 关键输入 → 输出 | 备注 |
|------|------|------------------|------|
| `parseRequirement` | 把自然语言/表单归一化为结构化出题参数 | 请求体 → `{exam, subject, module, difficulty, count}` | 正则关键词优先（黑龙江/省考/行测/资料分析/增长率/3道/中等）；模块别名表（资料/资分 等）；命中不全用默认值（黑龙江省考/行测/资料分析/中等/3）；**显式表单字段覆盖 NL 结果**；module 白名单校验（言语理解与表达/判断推理/数量关系/资料分析/常识判断） |
| `buildPrompt` | 约束模型输出质量与格式 | 参数 + 工具检索指引 + 质量规则 + JSON Schema → prompt | 公考出题人角色；**Wave 9 去硬编码**：模块知识点表移除，改为"先调用 search_question_bank 检索题库素材、基于素材命制"，知识点范围由检索结果决定；**Wave 11 思考引导**：命制前内部推演考点/数据自洽/答案唯一/解析闭环，思考不入答案；要求「仅输出 JSON」；禁止编造政策（C5） |
| `callLLM` | 真实出题的唯一接入点 | prompt(+tools) → 原始文本 | OpenAI 兼容协议（`base_url` + `/chat/completions`）；fetch + AbortController 超时 30s；失败重试 1 次（指数退避）；**Wave 9 function calling**：tools + tool_calls 往返（工具结果以 role:'tool' 回填，上限 2 轮）；**Wave 11 reasoning**：可选 `reasoning_effort`（none/low/medium/high）经 `buildChatBody` 透传；错误分类：未配置 Key / 超时 / HTTP 异常 / 网络异常；未配置 Key 立即抛「未配置」 |
| `validateQuestions` | 保证模型输出结构化合法可用 | 原始文本 → `{ok, questions, errors[]}` | ①剥 JSON 块（兼容 ```json 围栏）→ `JSON.parse`；②结构字段（exam/subject/module/difficulty/questions 非空数组）；③逐题（question 非空、options 恰为 A/B/C/D 四键、answer∈{A,B,C,D} 且与 options 键一致、analysis 非空、knowledgePoint 可缺省但应存在）；④一致性（answer 指向的选项文本非空等轻度校验）；提供轻微修复（如 `"C "` → `C`） |
| `mockData` | 兜底题库，保证闭环永远可演示 | — → 内置题目数组 | ≥3 模块（资料分析/判断推理/言语理解等）各 ≥3 道；难度混合；题目/选项/答案/解析自洽；格式严格符合 DATA_SCHEMA |

---

## 2. 数据流（mermaid）

### 2.1 核心出题链路（POST /api/generate）

```mermaid
flowchart LR
    U[用户] -->|配置表单 + 自然语言| W[前端 SPA<br/>ConfigForm / api/client.js]
    W -->|POST /api/generate<br/>{requirement?, exam?, subject?, module?, difficulty?, count?, context?}| R[Express 路由<br/>routes/generate.js]
    R --> P[parseRequirement<br/>显式表单字段覆盖 NL 结果]
    P --> B[buildPrompt<br/>角色 + 工具检索指引 + JSON Schema]
    B --> L[callLLM<br/>tools=search_question_bank<br/>30s 超时 + 失败重试 1 次]
    L -.函数调用 search_question_bank.-> Q[questionBank<br/>远程 API / 本地种子回退]
    Q -.role:'tool' 素材回填.-> L
    L -->|模型调用成功| V[validateQuestions<br/>四层校验 + 轻度修复]
    L -->|无 Key / 超时 / 异常<br/>统一抛错| M[mockData 兜底<br/>mock: true]
    V -->|合法| OK[响应 mock:false<br/>questions[] 完整]
    V -->|校验未过<br/>修复 + 重生成 ≤2 次| V
    V -->|仍失败| M
    M --> GEN[(GenerateResponse<br/>mock: true)]
    OK --> GEN
    GEN --> W2[前端渲染<br/>QuestionCard 只展示 id/question/options/knowledgePoint<br/>answer/analysis 隐藏于内存 不渲染进 DOM]
    W2 --> A[用户作答<br/>逐题点选]
    A --> J[前端本地判题<br/>用户答案 vs answer<br/>空答不计为错误]
    J --> R2[ResultPanel<br/>对/错 + 正确答案 + 解析 + 知识点统计<br/>提交后才展示]
```

### 2.2 关键路径说明（评审核对点）

1. **参数归一（parseRequirement）**：路由把请求体交给 `parseRequirement`；NL 识别出的各字段作为底值，请求体中**显式表单字段优先**，最终五元组 `{exam, subject, module, difficulty, count}` 必有值（缺省用默认值，不因缺字段不可用）。
2. **Prompt → 模型（buildPrompt → callLLM）**：`buildPrompt` 产出含 Schema 与质量约束的提示词；`callLLM` 是唯一模型通道，读 `config/env.js` 的环境变量，未配置 Key 立即抛「未配置」，由上层走 Mock。
3. **校验与兜底（validateQuestions → mockData）**：模型原始输出先过 `validateQuestions` 四层校验；不合格时「轻度修复 → 反馈重生成」，**重生成 ≤2 次**；仍失败或模型调用任何异常 → `mockData` 兜底，响应恒为合法 `GenerateResponse` 且 `mock:true`（C4）。
4. **渲染与判题**：前端只拿到 `mock, exam, subject, module, difficulty, questions[]`；其中 `answer/analysis` 仅在内存中使用，提交作答前绝不渲染进 DOM（C2）；判题在前端本地完成，空答不计为错误，提交后由 `ResultPanel` 展示对错、正确答案、解析与知识点统计。
5. **error 兜底**：任何未预期异常经全局错误中间件归一化为 `{error:{code,message}}` 返回，前端错误态展示错误信息 + 重试按钮，不白屏。

### 2.3 追问链路（POST /api/explain，加分项 B3）

```mermaid
flowchart LR
    U[用户<br/>没看懂再讲讲] --> W[前端<br/>ResultPanel 追问按钮]
    W -->|POST /api/explain<br/>{question, analysis, userAsk}| R[Express 路由<br/>routes/explain.js]
    R --> K{配置了 Key?}
    K -->|是| L[callLLM 生成<br/>通俗大白话]
    K -->|否| T[模板重述<br/>基于 question/analysis 通俗化]
    L --> O[返回 {explanation}]
    T --> O
    O --> WF[前端展示讲解]
```

---

## 3. Agent 七步流程职责表

对应根目录《开发流程_黑龙江省考AI出题Agent.md》第 3.5 节的职责与异常处理设计，落到本项目实现时为七步：

| # | 步骤 | 职责 | 输入 → 输出 | 异常处理 |
|---|------|------|-------------|----------|
| ① | 需求解析 `parseRequirement` | 把自然语言/表单归一化为结构化参数 | `requirement` / 表单字段 → `{exam, subject, module, difficulty, count}` | 正则关键词优先；命中不全用默认值（黑龙江省考/行测/资料分析/中等/3）；显式表单字段**覆盖** NL；模块白名单校验，非法模块归一/拒绝 |
| ② | Prompt 组装 `buildPrompt` | 约束模型输出质量与格式 | 参数 + 工具检索指引 + 质量规则 + JSON Schema → prompt | 纯本地组装；知识点由工具检索结果决定（Wave 9 去硬编码） |
| ③ | 模型调用 `callLLM` | 真实出题（含 function calling） | prompt(+tools) → 原始文本 | 未配置 Key 立即抛「未配置」；超时（30s）/ HTTP 异常 / 网络异常 → 捕获，可重试 1 次（指数退避）；工具往返 ≤2 轮；最终异常一律交由上层走 Mock |
| ④ | 校验修复 `validateQuestions` | 保证结构化合法可用 | 原始文本 → `{ok, questions, errors[]}`（修复后） | 剥首个 JSON 块 → `JSON.parse` → 逐题校验（题干非空 / options 恰四键 / answer∈{A,B,C,D} 且与选项键一致 / analysis 非空 / answer 与题干分析无矛盾）；失败「轻度补修 + 反馈重生成」**≤2 次**；仍失败 → **Mock 兜底并标记 `mock:true`** |
| ⑤ | 前端渲染 | 隐藏答案、逐题作答 | questions[] → 题卡 | 渲染层只收 `{id, question, options, knowledgePoint}`，answer/analysis 不传入不渲染；坏题跳过并提示 |
| ⑥ | 判题 | 判定正误 + 展示解析 | 用户答案 vs answer → 对/错 + 解析 | 前端本地比对；**空答不计为错误**；提交后才展示正确答案与解析 |
| ⑦ | 二次交互（加分） | 类似题 / 追问 | `context`（知识点/难度/排除项）→ 复用 ①~④；或 `{question, analysis, userAsk}` → `/api/explain` | 与 ①~⑥ 相同兜底链复用；无 Key 时 explain 用模板 |

> 一句话评审基线：**需求 → 定参 → 生成 → 校验（修复/重试/兜底三级）→ 结构化返回 → 判题解析**，任何一步失败都不会让用户白屏或拿到不可用的原始 Markdown（C3）。

---

## 4. Mock / 真实模型双轨机制

### 4.1 环境变量（密钥只存在于 `server/.env`，C1）

| 变量 | 含义 | 默认值 | 说明 |
|------|------|--------|------|
| `LLM_API_KEY` | 模型服务密钥 | 空 | 无 Key 即 Mock 模式；严禁写入前端代码/文档/仓库 |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 | 空 | `callLLM` 以此为基址拼 `/chat/completions` |
| `LLM_MODEL` | 模型名 | 空 | 透传给 `/chat/completions` 的 `model` 字段 |
| `QUESTION_BANK_API_URL` | 远程题库 API | 空 | function calling 数据源（Wave 9）：配置后优先联网检索最新题库素材，未配置/异常回退本地种子（`services/questionBank.js`） |
| `PORT` | 后端端口 | `3001` | 开发默认端口，前端 dev 代理目标 |

模板位于 `server/.env.example`（含中文注释）；`config/env.js` 读取并给默认值，Key 缺省不抛错（为 Mock 双轨提供前提）。

### 4.2 切换条件与兜底顺序

| 场景 | 判定 | 行为 |
|------|------|------|
| 无 Key | `LLM_API_KEY` 为空 | `callLLM` 立即抛「未配置」→ 路由 catch → `mockData` 兜底，响应 `mock:true` |
| 有 Key、调用成功 | 30s 内返回、HTTP 2xx | `validateQuestions` 校验；合法 → `mock:false`；不合法 → 修复 + 重生成 ≤2 次 → 仍失败 → `mockData` 兜底 `mock:true` |
| 有 Key、超时 | 超过 30s（AbortController） | 重试 1 次（指数退避）→ 仍失败 → 兜底 `mock:true` |
| 有 Key、HTTP/网络异常 | 非 2xx / 连接失败 | 重试 1 次 → 仍失败 → 兜底 `mock:true` |
| 校验最终失败 | 重生成 ≤2 次后仍不合法 | 整组回退 `mockData` → `mock:true` |

**双轨不变的契约**：无论走真实模型还是 Mock，响应都是合法 `GenerateResponse`（字段齐全），前端以 `mock` 字段区分来源——真实 `mock:false`，兜底 `mock:true`，闭环永远可演示（C4）。

### 4.3 界面 Mock 标识

- 响应 `mock:true` 时，`App.vue` 顶部标题栏显示 **「Mock 模式」徽标**（默认态即 Mock 模式）；同时展示对黑龙江具体政策不确定时的「Demo 范围」说明（C5）。
- 前端对 `mock` 字段零感知密钥来源，仅作展示用；README 说明真实模型接入点（填写 `.env` 三变量）与替换方式。

---

## 5. 扩展性设计

### 5.1 新增题型模块（接入点）

1. `server/src/services/mockData.js`：新增该模块的题目数组（格式严格符合 DATA_SCHEMA，答案解析自洽）；
2. `server/src/services/questionBank.js`：本地种子（mockBank）自动覆盖新模块实现，无需改检索代码；远程数据源由 `QUESTION_BANK_API_URL` 提供方维护（Wave 9 起新增题目素材已不依赖改 buildPrompt 代码）；
3. 前端 `ConfigForm.vue`：模块下拉增加对应选项；
4. **Schema 不变**（C3）：`GenerateRequest` / `GenerateResponse` / `Question` 结构与从模型侧约未来模块保持一致；
5. 回归：`npm run verify`（服务层断言）→ `npm run build`（前端）→ 适配 Wave 4 回归清单。

> 详细分步指南见 `.agents/skills/hlj-kaoqa-dev/SKILL.md`。

### 5.2 切换 / 更换模型（接入点）

- 模型调用只在 `server/src/services/callLLM.js` 一处发生；切换模型=改 `server/.env` 中 `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`（OpenAI 兼容协议），或在 `callLLM.js` 内适配新协议，无需改动路由与前端。
- 验证标准：无 Key 环境 `POST /api/generate` 返回 `mock:true` 且 `questions` 字段齐全；配置 Key 后返回 `mock:false`。

### 5.3 大规模出题时的架构演进（本 Demo 为单机同步版，演进方向）

- **队列化 / 异步**：出题请求入队（如 BullMQ / Redis），工作进程消费并回调，避免长请求阻塞；前端轮询/SSE/WebSocket 拿结果（对应 B6 生成状态）。
- **缓存与去重**：同参数（module/difficulty/count/知识点）结果缓存；对历史题干做相似度/向量化去重（对应 B2/B7），命中则重生成或复用。
- **限流与防重**：按用户/会话限流；幂等键防止重复提交重复计费（前端 submitting 锁仅是初阶防护）。
- **存储与统计**：题目库、作答记录、学习统计落库（本地 localStorage → 后端 DB）；B4 学习统计与 B5 难度自适应依赖统一记录层。
- **质量保障**：人工/低配模型抽检 Review（对应 B1），坏题自动重生成并告警。

---

## 附：与 AGENTS.md / CLUSTERS.md 的一致性对照

| 约束 | 本文档落脚点 |
|------|--------------|
| C1 Key 隔离 | §1.2、§4.1：密钥仅存 `server/.env`，前端零感知，键名=CLUSTERS 定义 |
| C2 答案隐藏 | §1.1、§2.1、§3 ⑤：渲染层 props 白名单，answer/analysis 提交前不渲染 |
| C3 统一 Schema | §1.2、§2、§4.2：字段结构严格采用开发流程 3.4 / DATA_SCHEMA 定义，不新增字段 |
| C4 Mock 双轨 | §1.3 callLLM、§2.1、§4.2：调用唯一集中于 callLLM.js，30s 超时/重试 1 次/校验重生成 ≤2 次/Mock 兜底 mock:true |
| C5 不编造事实 | §4.3：Mock 模式与 Demo 范围标识 |
| C6 完成定义 | 开头状态标识：完成度以 README/REGRESSION 真实进度为准 |
| CLUSTERS 目录约定 | §1.1/§1.2 分层与 AGENTS.md §3 目录一一对应，未引入新文件、未改组件/接口名 |
| 开发流程 3.5 七步 | §3 表格逐条对齐职责/输入输出/异常处理 |