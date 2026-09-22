---
name: hlj-kaoqa-dev
description: "开发/扩展“黑龙江省考 AI 出题 Agent”Demo（出题配置、自然语言解析、题目生成与校验、答题判题、Mock 双轨、新增题型模块、切换模型）时加载本技能。"
---

# hlj-kaoqa-dev — 黑龙江省考 AI 出题 Agent 二次开发技能

> 本技能是本仓库的「开发操作手册」：告诉你在哪改、怎么改、怎么验证、验证不过怎么办。
> **最高约束是仓库根 `AGENTS.md`，字段语义权威是 `docs/DATA_SCHEMA.md`；本技能与二者矛盾时，以 AGENTS.md / DATA_SCHEMA.md 为准。**

## 1. 项目一句话与目录速览

**项目一句话**：黑龙江省考行测智能刷题 Demo：用户说出/选择练习需求 → Agent 出题（统一结构化 JSON）→ 用户作答 → 系统判题并展示解析。

**分层与职责**：`server/` 出题与判题的服务端（Node+Express，ESM）；`web/` 配置与展示的前端（Vue3+Vite）；`docs/` 全部权威文档；`.agents/` 本技能。

```
demo_01/
├── AGENTS.md                       # 最高约束：硬性约束 C1~C6、目录约定、代码规范、原子验证(§5)、文档义务(§6)、波次规则(§8) —— 动手前必须读
├── README.md                       # 运行手册；"已完成/未完成/已知限制"须与真实进度一致，禁止夸大
├── AI-CODING.md                    # AI 编码过程复盘（工具/分界/错误与修正，必须真实）
├── docs/
│   ├── CLUSTERS.md                 # 波次×集群编排、各集群原子任务/验收/禁止、Wave 4 回归清单
│   ├── ARCHITECTURE.md             # 系统架构与数据流（分层/Agent 流程/Mock 双轨/扩展设计）
│   ├── API.md                      # 接口文档：GET /api/health、POST /api/generate、POST /api/explain + 错误码
│   ├── DATA_SCHEMA.md              # 统一数据结构（权威 Schema：GenerateRequest / GenerateResponse / Question）
│   └── 开发流程_黑龙江省考AI出题Agent.md  # 原始需求拆解与时间评估
├── .agents/skills/hlj-kaoqa-dev/SKILL.md  # 本技能文件
├── server/                         # 后端 Node.js + Express（ESM，Node 18+）
│   ├── .env.example                # 环境变量模板（PORT/LLM_API_KEY/LLM_BASE_URL/LLM_MODEL）
│   ├── src/
│   │   ├── index.js                # 入口：Express + 中间件 + 路由挂载 + 全局错误中间件（统一 {error:{code,message}}）
│   │   ├── config/env.js           # 环境变量读取与默认值（Key 缺省不抛错 → 走 Mock）
│   │   ├── routes/generate.js      # POST /api/generate：七步出题闭环（route 内禁止直写模型调用/JSON 解析）
│   │   ├── routes/explain.js       # POST /api/explain：追问讲解
│   │   └── services/
│   │       ├── parseRequirement.js     # NL 需求解析：正则+别名 → {exam,subject,module,difficulty,count}，缺省用默认值
│   │       ├── buildPrompt.js          # Prompt 组装：出题人角色 + 模块知识点样例 + JSON Schema 输出约束
│   │       ├── callLLM.js              # 模型调用唯一封装（C4）：OpenAI 兼容 /chat/completions + 30s 超时 + 失败重试 1 次 + 无 Key 抛错
│   │       ├── validateQuestions.js    # 四层校验：剥JSON → 结构字段 → 逐题字段 → 一致性；轻微修复；返回 {ok,questions,errors}
│   │       └── mockData.js             # 内置 Mock 题库（格式严格符合 DATA_SCHEMA，模块×≥3 题，答案解析自洽）
│   └── scripts/verify-services.js      # 服务层原子验证脚本（npm run verify）
└── web/                              # 前端 Vite + Vue 3
    ├── vite.config.js              # dev 5173，/api 代理 → http://localhost:3001
    └── src/
        ├── main.js / App.vue       # 布局 + 状态（持有完整数据，答案提交前不传渲染层）+ 经 api/client.js 请求
        ├── api/client.js           # 唯一后端访问入口 postJSON(path,body)；禁止组件内拼 fetch URL
        └── components/
            ├── ConfigForm.vue      # 配置表单 + 自然语言输入（模块/难度/题量下拉）
            ├── QuestionCard.vue    # 题卡渲染（props 只收 id/question/options/knowledgePoint —— 答案隐藏）
            └── ResultPanel.vue     # 判题结果/解析/汇总（仅提交后才接收 answer/analysis）
```

**三个分层纪律**（来自 AGENTS.md §4）：
- 模型调用与 JSON 解析**只在 `server/src/services/`**（C4），route 只做组装与编排。
- 前端请求**只经 `web/src/api/client.js`**。
- 一切前后端数据交互使用**统一结构化 JSON**，严禁返回整段 Markdown 由前端直接展示（C3）。

## 2. 快速启动

```bash
# 后端（监听 3001）
cd server && npm install && npm run dev

# 前端（监听 5173，/api 代理到 3001）
cd web && npm install && npm run dev

# 服务层原子验证（改完任何 server/src/services 后必跑）
cd server && npm run verify

# 前端构建检查（改完任何 web/src 后必跑）
cd web && npm run build
```

无 `server/.env`（未配 Key）时，`POST /api/generate` 自动回退内置 Mock 题库，响应带 `mock: true`，闭环永远可演示。

## 3. 标准开发循环

每个改动遵循 6 步循环，缺一不可（尤其 ⑤⑥）：

1. **① 读 AGENTS.md** — 刷新硬性约束 C1~C6（Key 隔离 / 答案隐藏 / 统一 Schema / Mock 双轨 / 不编造事实 / 完成定义）。
2. **② 查 docs/CLUSTERS.md** — 确认当前波次与所属集群，只看本集群原子任务清单；前置波次未验收不得流入下游；不越界重构无关代码（§8）。
3. **③ 定位模块文件** — 按上文目录树找到目标文件，**先 Read 再改**，确保与真实代码一致。
4. **④ 原子开发** — 最小改动：后端业务进 services、前端请求进 api/client.js、命名 `camelCase`/组件 `PascalCase.vue`/常量 `UPPER_SNAKE_CASE`；不新增大型依赖。
5. **⑤ 原子验证** — 按 AGENTS.md §5 表执行：service 层 `npm run verify` 全绿；接口 `curl` 返回合法 JSON 且 `mock:true`/字段齐全；前端 `npm run build` 零错误 + 浏览器走通交互（含 DOM 无答案暴露）。
6. **⑥ 同步文档** — 接口/数据结构变更**先行更新** `docs/API.md`、`docs/DATA_SCHEMA.md` 再继续；`README.md` 进度如实；`AI-CODING.md` 补真实复盘；**未通过验证的模块不得标记为完成（C6）**。

## 4. 新增一个题型模块（示例：数量关系）

适用：在 5 大模块白名单（言语理解与表达 / 判断推理 / 数量关系 / 资料分析 / 常识判断）中新启用一个此前未实现的模块，或给已有模块扩充题库。**Schema 结构不变**，只加数据与选项。

**Step 1 — 加 Mock 数据**（`server/src/services/mockData.js`）
新增数量关系模块数组（或扩充该模块数组），条目格式严格符合 `docs/DATA_SCHEMA.md`（逐字段类型/取值见权威文档）：

```js
const mockShuLiang = {
  exam: '黑龙江省考',
  subject: '行测',
  module: '数量关系',
  difficulty: '中等',
  count: 3,
  questions: [
    {
      id: 'qty-001',                      // id 全仓库唯一（与既有题目不重复）
      question: '某工程甲单独做需 12 天完成，乙单独做需 18 天完成，现甲乙合作 4 天后由乙继续完成，还需多少天？',
      options: { A: '6 天', B: '8 天', C: '10 天', D: '12 天' },  // 恰为 A/B/C/D 四键
      answer: 'B',                         // 必须 ∈{A,B,C,D} 且与 options 键一致，指向的选项文本非空
      analysis: '设工作总量为 36（12 与 18 的公倍数），甲的效率为 3，乙的效率为 2；合作 4 天完成 5×4=20，剩余 16，乙还需 16÷2=8 天。故选 B。',
      knowledgePoint: '工程问题',           // 必填（校验层可缺省但应存在）
    },
    // …… 至少 3 道，难度混合（简单/中等/困难），解析与答案自洽，不得自相矛盾
  ],
};
// 将 mockShuLiang 加入导出的模块数组（现有 mockData 的导出集合），供响应按 module 过滤兜底
export const mockModules = [ /* 资料分析、判断推理、言语理解、数量关系…… */ ];
```

数量关系推荐知识点（通用行测规范，勿编造官方数据，见 C5）：工程问题、行程问题、利润问题、排列组合与概率、数列、几何。注意 `npm run verify` 的完整性断言会**遍历全部模块**——新数组字段不全或答案解析与答案矛盾会导致 verify 失败。

**Step 2 — 加 Prompt 模块样例段**（`server/src/services/buildPrompt.js`）
在模块专属知识点范围内补"数量关系"段（保持既有段落的写法与位置风格）：

```js
数量关系：覆盖工程问题、行程问题、利润问题、排列组合与概率、数列、几何等基础题型，注重列式与快速估算；
```

系统提示词中的 JSON Schema 输出要求、质量约束（4 选项/唯一答案/解析与答案一致/禁编造政策）、"仅输出 JSON"指令均保持不变。

**Step 3 — 加前端配置选项**（`web/src/components/ConfigForm.vue`）
在模块下拉的可选项数组中补入 `'数量关系'`（若不在其中），其余下拉（难度：简单/中等/困难；题量：1~10）不动。

**Step 4 — 原子验证**

```bash
cd server && npm run verify    # 断言全绿：新模块 mock 数据完整、解析/校验/Prompt 结构全部通过
cd web && npm run build        # 零错误
```

（可选 e2e）无 Key 环境：`curl -X POST localhost:3001/api/generate -H 'content-type: application/json' -d '{"module":"数量关系","count":3}'` → 返回合法 GenerateResponse、`mock:true`，且题目的 `module` 为"数量关系"。

**Step 5 — 同步文档**：`docs/CLUSTERS.md` 对应集群条目按进度勾选；`README.md` 模块覆盖列表更新；本改动不改 Schema 字段语义，如需在 `docs/DATA_SCHEMA.md` 模块取值说明里补充"数量关系"可加一行说明。

## 5. 切换真实模型（Mock → 真实 LLM）

1. **建 .env**：`cp server/.env.example server/.env`（`.env` 已被 `.gitignore` 排除，含密钥文件禁止提交/写文档）。
2. **填三个变量**（OpenAI 兼容协议，格式见模板注释）：
   - `LLM_API_KEY=你的密钥`
   - `LLM_BASE_URL=兼容端点`（示例 `https://api.deepseek.com/v1` 或 `https://api.openai.com/v1`）
   - `LLM_MODEL=模型名`（示例 `deepseek-chat` / `gpt-4o-mini`）
   - 可选 `PORT=3001`
3. **重启 server**：`cd server && npm run dev`（`config/env.js` 在启动时读取，改 `.env` 必须重启才生效）。
4. **验证**：`curl -X POST localhost:3001/api/generate -H 'content-type: application/json' -d '{"module":"数量关系","count":2}'` → 响应 `mock:false` 即真实模型生效。
5. **兜底行为（不配置则自动 Mock）**：未配 `LLM_API_KEY` 或超时/调用异常 → `callLLM` 抛"未配置/超时"类错误 → route 捕获后用 `mockData` 兜底，响应 `mock:true`，前端显示"Mock 模式"徽标。**密钥只允许存在于 `server/.env`（C1）**。

## 6. 错误自查速查表

| 现象 | 可能根源 | 处置方式 |
|------|----------|----------|
| 模型返回非法 JSON（```json 围栏/前后缀文本） | 校验第 ① 层未处理干净 | `validateQuestions` 剥取首个 JSON 块 → 轻微修复（首尾空白等）→ 失败反馈 LLM 重生成 ≤2 次 → 仍失败用 `mockData` 兜底 `mock:true`，前端不崩 |
| 要求字段缺失（question 空 / options 非恰 A-D 四键 / answer∉{A,B,C,D} / analysis 空） | 校验第 ②③ 层拦截 | 返回 `{ok:false,errors[]}`，route 触发重生成或 Mock；坏题绝不下发前端 |
| answer 与 options 键不一致 / 选项文本为空 | 校验第 ④ 层一致性 | 拦截并反馈重生成；mock 数据自查是否 self-consistent |
| 前端 DOM 中答案提前暴露（answer/analysis 可见） | 渲染层剥离失守（C2） | 检查 `QuestionCard.vue` 的 props：**只收 id/question/options/knowledgePoint**；answer/analysis 只存 App.vue 内存，用户提交后才传入 ResultPanel；用浏览器审查元素验证 |
| 响应不是合法 GenerateResponse / 混入整段 Markdown | 绕过 Schema 直返文本（C3） | 检查 route 是否越过 services 自写逻辑（禁止）；按 `docs/DATA_SCHEMA.md` 组装响应 |
| 一直 `mock:true` 但想用真实模型 | `.env` 未配置或未重启 | 按 §5 填 LLM_API_KEY 三件套并重启 server |
| 前端请求失败/白屏 | 组件内拼 fetch 或代理失效 | 一律经 `src/api/client.js`；确认 `vite.config.js` 代理 /api→3001 且 server 已启动 |
| 密钥出现在前端/文档/提交内容 | 违反 C1 | 密钥只允许在 `server/.env`；清除所有散落副本并自查 |

**文档义务清单**（每次改动收尾对照，AGENTS.md §6"一个都不能少"）：
- 接口或数据结构变更 → 先同步 `docs/API.md`、`docs/DATA_SCHEMA.md`，再继续开发。
- `README.md`"已完成/未完成/已知限制"与真实进度一致，禁止夸大。
- `AI-CODING.md` 真实可复盘（用的工具、AI 生成与人工设计分界、错误与修正）。
- 未通过原子验证的模块不得在任何文档标记为完成（C6）。

## 零上下文快速上手

一个"零项目上下文"的 AI 接到"给数量关系模块加 Mock 数据并新增配置选项"时：读本技能 → 按 §2 起两端 → 按 §3 循环（先读 AGENTS.md）→ 直接执行 §4 的 Step 1~5 → 用 `npm run verify` + `npm run build` 收尾验证。