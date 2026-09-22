# AI-CODING.md — AI 编码过程复盘

> **定位**：本项目 AI 协作开发的真实复盘记录（任务书交付物之一，见《开发流程_黑龙江省考AI出题Agent.md》§5.2 第 4 项；常驻文档义务见 AGENTS.md §6）。
> **状态声明**：本文档为 **Wave 7 定稿**（Wave 7 新增：A 级文档族 24 份 + 全量验证记录）。以下所有记录均以开发过程中的真实事件为据（原子验证输出、curl 实测、回归清单、交付自查），非事后编造。

---

## 0. 填写总则（先读本节）

### 0.1 本文件的义务与红线

- 必须**真实可复盘**：用的工具、任务拆法、AI 生成与人工设计的分界、AI 的错误与修正过程，均须有据可查（AGENTS.md §6）。
- 所有"已完成"结论以 AGENTS.md §5 的原子验证为准（`npm run verify` / `curl` 实测 / `npm run build` / 回归清单），**未验证的模块不得标记为完成**（硬性约束 C6）。
- **禁止事后编造**：第 4 节错误记录表全部来自开发过程的实时补录（验证暴露 / 交付自查），无证据的错误一律不写。

---

## 1. 使用的 AI 工具与模型清单

| 工具 | 用途（在本项目中做了什么） | 说明（版本/接入方式/备注） |
|---|---|---|
| NightHawk CLI（当前代理环境） | 主代理：需求拆解、波次规划、集群编排、文档定稿、最终交付汇报 | 全程作为主编排方，未作为模型后端参与出题 |
| Agent 子代理（coder / explore / plan 类型） | 各波次内的模块化原子开发与验证（脚手架、服务层、路由、组件、回归修复、加分项 B2） | 每次携带独立上下文与精确提示词；`Agent` 工具投递 |
| AgentSwarm（并行集群投递） | Wave 0 文档集群（C0.1~C0.5 并行）、Wave 2/3 模块并行、Wave 5.2a B1 校验强化 | 并行多代理体；Wave 0 首调时因缺 `description` 被拒（见 §4 错误 5） |
| Bash（curl / node / npm / pkill / lsof） | 原子验证：接口实测、服务启停、端口释放确认、`npm run verify` / `npm run build` | 所有"已完成"结论均以其输出为据 |
| Read / Edit / Write / Grep / Glob | 代码与文档读写、精准定位 | 优先于 shell 文件操作，保证可审计 |
| LLM 出题后端（OpenAI 兼容协议，未命名） | 出题 Prompt 的真实模型端（`services/callLLM.js`） | 按协议实现（/chat/completions、超时可配、四层校验）；Wave 14 已实测通过（2026-09-22 DeepSeek `deepseek-flash`，count=3/5/10 均 mock:false；function calling 往返实测） |
| Mock 双轨（`services/mockData.js`） | 无 Key / 超时 / 校验失败时的兜底出题源 | 150 题 / 五大模块各 30（Wave 13 后）；响应携带 `mock:true` 供前端标识 |

> 全开发过程共投递 10+ 个原子任务集群 / 单代理，所有产出均经主代理复核验证（verify / build / curl）后才放行进入下一波次。

---

## 2. 任务如何拆成开发步骤

任务拆解采用**波次（Wave）集群模式**，权威定义见 `docs/CLUSTERS.md`。本节为执行记录：逐波次记录实际拆解结果、交付物与验证方式，并标注与计划的偏差。

**波次结构（引用 CLUSTERS.md §0）**：

> Wave 0 文档 → Wave 1 脚手架 → Wave 2 后端 → Wave 3 前端 → Wave 4 联调 → Wave 5 收尾；波次内集群并行，波次间由主 Agent 验证后放行。

| 波次 | 集群 | 交付物 | 验收方式（对应 AGENTS.md §5） |
|---|---|---|---|
| Wave 0 文档 | C0.1~C0.5 | ARCHITECTURE / API / DATA_SCHEMA / README 骨架 / AI-CODING 骨架 / SKILL / AGENTS.md 总纲 / CLUSTERS.md | 章节齐全、与总纲无矛盾 |
| Wave 1 脚手架 | C1.1 server / C1.2 web | Express(ESM) 骨架、Vite+Vue3 骨架、api/client.js | `curl /api/health`=ok、`npm run build` 零错误 |
| Wave 2 后端 | C2.1 服务层五件套 / C2.2 路由+LLM | parseRequirement / buildPrompt / callLLM / validateQuestions / mockData；/api/generate | `npm run verify` 全绿；无 Key 下 curl 返回 mock:true 且字段齐全 |
| Wave 3 前端 | C3.1 配置+渲染 / C3.2 答题+判题+统计 | ConfigForm / QuestionCard（答案隐藏）/ ResultPanel | build 零错误；DOM 结构无答案暴露（C2） |
| Wave 4 联调 | C4.1 端到端回归 | docs/REGRESSION.md（R1~R4 检出与修复） | R1~R4 修复后 curl 实测全过 |
| Wave 5 收尾 | 5.1 回归修复 → 5.2a B1 校验强化 → 5.2b B2 再来一道 → 5.3 README/AI-CODING 定稿 → 5.4 最终自检 | B1：validate 一致性强化（5 项新断言）；B2：excludedQuestions 硬过滤 + 前端追加模式；两份文档定稿 | verify 32 项全绿、build 零错误、B2 curl 实测（排除集命中数为 0） |
| Wave 6 Apple 风格 | B1 全局 → B2 ConfigForm → B3 QuestionCard → B4 ResultPanel → C 原子性审计 → D 定稿 | 全局色板 `:root`、毛玻璃头栏、胶囊按钮、分段难度、统计区橙色系；删除冗余 `v-show`；按钮 handler 全量核验 | verify 32 / e2e 8 / build 三分支全绿 |
| Wave 7 文档族+全量验证 | — | A 级文档族 24 份（01~05 五目录，HLJKS 命名规范）+ README/AI-CODING/COMPLIANCE 追加 + 全量回归 | verify 32/32、e2e 8/8、build 101ms、BUG-001~008 全 CLOSED |

> 波次结构（引用 CLUSTERS.md §0）：Wave 0~6 为上轮定稿；**Wave 7 为本轮新增**（A 级文档族 24 份 + 全量验证）。

### 执行记录：Wave 0（文档基建）
- 计划内容：五文档 + AGENTS.md 总纲 + CLUSTERS + SKILL，并行集群产出。
- 实际完成：全部落地于 `docs/`、根目录与 `.agents/skills/hlj-kaoqa-dev/`。
- 与计划偏差：AI-CODING 先以"模板骨架"交付，避免未达时机先填内容（失真风险），Wave 5 首度定稿、本文档后续随 Wave 6 同步更新。
- 验证证据：产物清单交叉核对（AGENTS.md §6 文档义务逐项存在）。
- 放行结论：PASS。

### 执行记录：Wave 1（脚手架）
- 计划内容：server（Express ESM）与 web（Vite+Vue3）双端骨架。
- 实际完成：`server/src`（config/routes/services 分层）、`web/src`（api/components 分层）落位。
- 与计划偏差：无。
- 验证证据：`curl /api/health` → `{"ok":true}`；`npm run build` 零错误。
- 放行结论：PASS。

### 执行记录：Wave 2（后端）
- 计划内容：服务层五件套 + 路由/LLM 接入。
- 实际完成：parseRequirement（别名归一、显式字段优先）、buildPrompt（含 context 续出提示）、callLLM（超时/重试/无 Key 判定）、validateQuestions（四层校验）、mockData；/api/generate 七步流程。
- 与计划偏差：错误 1（§4）发生在 C2.1 验收时，返工一次。
- 验证证据：`npm run verify` 全绿；curl 实测自然语言 → mock:true、字段齐全。
- 放行结论：PASS。

### 执行记录：Wave 3（前端）
- 计划内容：配置表单 + 题卡渲染（答案隐藏）+ 答题判题 + 学习统计。
- 实际完成：ConfigForm（表单+自然语言双入口）、QuestionCard（仅收 id/question/options/knowledgePoint）、ResultPanel（判题/解析/统计）、App.vue 状态编排。
- 与计划偏差：错误 2（§4）发生在 C3.1 验收时，返工补齐题库。
- 验证证据：`npm run build` 零错误；C2 剥离经代码走查确认。
- 放行结论：PASS。

### 执行记录：Wave 4（联调回归）
- 计划内容：端到端回归，产出 REGRESSION.md。
- 实际完成：检出并修复 R1~R4（§4 错误 3 的四个缺陷），逐项 curl 实测回填回归报告。
- 与计划偏差：回归从 9 项收敛为 4 个真实缺陷（R1~R4），按真实性原则如实定级。
- 验证证据：四组 curl 实测（非法 module→400、非法 count→400、正常→mock:true、空体→200；前端错误归一→503）。
- 放行结论：PASS。

### 执行记录：Wave 5（收尾 + 加分项）
- 计划内容：5.1 回归修复 → 5.2 加分 B1/B2 → 5.3 文档定稿 → 5.4 最终自检。
- 实际完成：
  - 5.1 R1~R4 修复并实测（同 Wave 4 收尾）。
  - 5.2a B1 校验强化：`validateQuestions.js` 增补一致性规则（选项完全重复→error；解析声明答案与 answer 冲突→error；选项互为超长子串→warning；_normalizeOption 去首尾空白与常见中英文标点），verify 32 项全绿。
  - 5.2b B2「再来一道类似」：后端 `context.excludedQuestions` 硬过滤（空回退保契约 + console.warn）、前端按钮 + `_runGenerate(body, {append:true})` 追加模式（按 id 去重、保留已选答案、清旧结果）；curl 实测排除集命中 0。
  - 5.3 README / AI-CODING 定稿（即本文件与 README.md）。
  - 5.4 最终自检：文档清单复核、verify / build / curl 全绿、TodoList 全 done。
- 与计划偏差：**错误 4（§4）** —— B2 集群投放时模板写死 B1 指令，两代理并行写同一文件且 B2 缺失；改为单 Agent 补做并复核。
- 验证证据：verify 32 项全绿（两次独立复核）、build 零错误、B2 curl 实测（mock:true、排除集命中 0、字段齐全、端口释放）。
- 放行结论：PASS。

### 执行记录：Wave 6（Apple 风格 UI + 原子性审计）
- 计划内容：B1 全局 Apple 风 → B2 ConfigForm → B3 QuestionCard → B4 ResultPanel → C 界面原子性审计 → D 文档定稿。
- 实际完成：
  - B1：`index.html` 增 theme-color/description/防闪白；`App.vue` `:root` 全换 Apple 色板（主蓝 `#0071e3`、成功绿/危险红/警示橙、玻璃拟态阴影、980px 胶囊圆角），body 换 SF Pro 字体栈，头栏毛玻璃（blur 20px）。
  - B2：ConfigForm 难度改为 segmented 胶囊（v-for + active 白底）、题量步进按钮圆形化、提交按钮 44px 胶囊、聚焦环统一。
  - B3：QuestionCard 选项 12px 14px 圆角 padding、选中态蓝晕、知识点标签橙色系。
  - B4：ResultPanel 全量硬编码色值 → 主题变量（对错统计绿/红、弱项区橙色系）。
  - C：删除「再来一道类似」冗余 `v-show`（外层 action-bar 已有 `v-if` 兜底）；全量走查 12 处 @click/@submit 均有 handler，无死按钮；触发后仍保留 handleAnotherSimilar 内部空列表守卫。
  - D：COMPLIANCE / README / AI-CODING 三文档定稿。
- 与计划偏差：无 Playwright MCP 可用（工具表仅 charts/filesystem/mermaid），Wave C 降级为代码级原子性审计 + build + e2e，如实声明无浏览器自动化（§4）。
- 验证证据：verify 32/32、e2e 8/8（EXIT=0）、web build 绿（102ms）—— 三分支全量回归。
- 放行结论：PASS。

### 执行记录：Wave 7（A 级文档族 24 份 + 全量验证）
- 计划内容：按《A 级专业化开发流程：完整文档清单与命名规范》补齐 24 份文档（01_立项规划 5 份 / 02_需求分析 3 份 / 03_设计 4 份 / 04_实现测试 7 份 / 05_交付维护 5 份），采用 HLJKS 命名规范 + 状态标记，覆盖用户故事、需求分析、需求拆解、技术栈、产品变更、测试案例、痛点解析、强制约束等主题。
- 实际完成：五目录 24 份文档全部落位（ls 实测 5+3+4+7+5=24）；README / AI-CODING / COMPLIANCE 三文档追加 Wave 7 记录；BUG-001~008 缺陷状态全部 CLOSED。
- 与计划偏差：文档以 .md 落地（SCM §1 已声明，非 docx）；无浏览器自动化沿用 Wave 6 声明；核心代码零改动（用户明确要求只补文档 + 验证）。
- 验证证据：verify 32/32、e2e 8/8（EXIT=0）、web build 101ms —— 全量回归二次验证通过。
- 放行结论：PASS。

### 执行记录：Wave 8（最终验证：前后端一致性 / 硬编码审计 / 文档一致性 + BUG-009 修复）
- 计划内容：交付前最终验证——①前后端一致性核对（端点/请求/响应/错误格式/枚举/默认值）②硬编码审计（声明式常量 vs 散落字面量）③对照原始需求文档与 24 份 A 级文档二轮校验代码。
- 实际完成：
  - 一致性核对：三端点（health/generate/explain）路径与统一错误体 `{error:{code,message}}`（400/404/503）两侧一致；请求体五字段 OVERRIDE_KEYS、响应 GenerateResponse、错误格式逐项 PASS；五大模块白名单 / 三档难度 / count 1~10 / 默认值（黑龙江省考/行测/资料分析/中等/3）在前后端与文档中逐字一致（声明式常量跨层重复定义但相等，未引共享包，属既定设计）。
  - 硬编码审计：端口（3001/5173，e2e 用 3199 隔离）、LLM baseUrl/model/超时、localStorage key（hlj-kaoqa-stats）均为声明式常量；Mock 题库为既定静态数据源；无散落魔法字面量与密钥（C1 复核）。
  - **错误 8（§4）**：最终验证发现「再来一道类似」（B2）前端缺陷——`App.vue handleAnotherSimilar()` 读取 `formState.value.module/.difficulty`，而 `formState` 为 `reactive` 对象（无 `.value`），点击该按钮必抛 TypeError，B2 功能不可用。最小修复：`formState.value.X` → `formState.X`（两处），`npm run build` 复核通过。
  - 文档一致性：DATA_SCHEMA（默认值/count 1~10/错误码 400/503）、API/IRS（三端点与错误码）、IDD（请求/响应字段）、TSR/BUG（BUG-001~008 CLOSED）抽查与代码相符。
- 与计划偏差：无浏览器自动化沿用 Wave 6 声明；本轮为验证 + 1 处确凿缺陷修复，未做重构、未抽共享包、未改接口契约。
- 验证证据：verify 32/32、e2e 8/8（EXIT=0，修复后重跑）、web build 106ms（修复后）—— 三分支全量回归取新证据。
- 放行结论：PASS。

### 执行记录：Wave 9（function calling 去硬编码：最新题库动态检索）
- 计划内容：按用户要求"buildPrompt 提示词尽可能减少硬编码，以联网 tool（function calling）形式获取最新题库进行练习"——①新增题库检索服务 questionBank（本地种子 + 远程可插拔）②buildPrompt 移除模块→知识点硬编码表，改为工具检索指引 ③callLLM 支持 tools + tool_calls 往返 ④generate 注入工具与执行器 ⑤verify 断言重构。
- 实际完成：
  - `questionBank.js`：`search_question_bank` 工具定义（module 必填枚举五模块、difficulty/topic/limit 可选）+ 检索实现；数据源双轨——`QUESTION_BANK_API_URL` 配置时优先联网（5s 超时，任何异常回退本地），否则本地种子（`mockData` 新增只读 `mockBank` 元数据导出，避免重复硬编码数据）。
  - `buildPrompt.js`：删除 `MODULE_KNOWLEDGE` 表与"本模块知识点范围"文案；system 新增工具检索指引（先调用 search_question_bank → 基于素材命制原创改编题 → 严禁凭空编造）；user 知识点侧重兜底文案改为"依据工具检索到的题库素材知识点命制"。
  - `callLLM.js`：`_fetchOnce` 支持 tools 透传与 `{content, toolCalls}` 解析；新增 `_runSession` 工具会话循环（tool_calls → 执行器 → role:'tool' 回填 → 再请求，上限 2 轮）；对外仍返回 content 字符串，无 Key 逻辑不变（NO_KEY → Mock）。
  - `generate.js`：callLLM 两处调用注入 `{ tools: QUESTION_BANK_TOOLS, toolExecutor: _toolExecutor }`；未知工具返回结构化错误回填模型。
  - `env.js` / `.env.example`：新增 `QUESTION_BANK_API_URL`（缺省空串回退本地）。
  - `verify-services.js`：**错误 9（§4）**——ok() 改为 async 后顶层未 await，主流程在全部用例前先打印汇总行（计数失真、退出码判断前置）；重构为 `async function main()` + 全部用例 `await ok()`，输出顺序与判定恢复正确，用例数 32→40（删 MODULE_KNOWLEDGE 2 项/增 function calling 13 项：system 指引、去硬编码、tools 结构、questionBank 7 项）。
- 与计划偏差：远程题库为**可插拔能力**（真实"最新题库"依赖部署方提供 QUESTION_BANK_API_URL，本地演示默认种子）；无浏览器自动化声明沿用；行为契约（HTTP 层）不变。
- 验证证据：verify 40/40（六分组）、e2e 8/8（EXIT=0）、web build 100ms —— 三分支全量回归。
- 放行结论：PASS。

### 执行记录：Wave 10（Mock 随机化 + 最终交付比对）
- 计划内容：用户交付前质疑"题目非随机生成"——修复 Mock 固定题库观感；随后对原始需求文档（docx 190 段）做最终交付比对。
- 实际完成：
  - `mockData.js`：`getMockQuestions` 改为过滤后 **Fisher-Yates 洗牌随机抽样**（副本操作，不污染 _bank/mockQuestions/mockBank）；新增导出 `shuffleOptions(q)`——A/B/C/D 四键乱序、answer 键同步、解析首处「故选 X」同步为答案键（题库 16 处解析统一该格式，已核）。
  - `generate.js`：`_mockQuestions` 对兜底题逐题 `shuffleOptions`（真实 LLM 链路不洗,输出天然随机）；B2 排除集按题干文本不受影响。
  - `verify-services.js` +2 断言（42 项）：shuffleOptions 结构不变性（键/值集合/answer 指向/解析声明同步/源不改）、20 轮至少一次换位（伪随机有效性）。
  - 实测：相同参数 `{"module":"资料分析","count":3}` 连续两次请求,选项排列完全不同（mock:true 下每次均为"新题观感"）。
  - 最终交付比对：docx 190 段 × 交付物逐条核对,结论见 README §11 或本波次记录（基础项全满足;真实 LLM 未实测为客观环境限制,接入点已完备）。
- 与计划偏差：用户未提供 LLM Key（先前已确认方案）,真实 `mock:false` 链路维持"代码就绪 + 无凭据未实测"如实声明,未伪装。
- 验证证据：verify 42/42（新增随机化断言）、e2e 8/8（EXIT=0）、web build 102ms；两次请求实测输出对比留存。
- 放行结论：PASS。


### 执行记录：Wave 11（LLM 显式思考增强：方案 A 思考引导 + 方案 B 推理模型参数）
- 计划内容：用户咨询"有 Key 如何接入 + 如何让 LLM 思考生成"后，选定实施 A+B 两方案。
- 实际完成：
  - A 思考引导：`buildPrompt.js` system 新增「思考要求（内部推演，不入答案）」块——命制每题前先推演考点/数据自洽/干扰项/答案唯一性/解析闭环，**严禁思考文本出现在输出**；兼容所有模型，不破坏 JSON Schema。
  - B 推理参数：`callLLM.js` 新增导出纯函数 `buildChatBody(model, messages, tools, reasoningEffort)`（tools 非空才写入、reasoning_effort 仅接受 none/low/medium/high 枚举，非枚举忽略）；`env.js`/`.env.example` 新增 `LLM_REASONING_EFFORT`；`generate.js` 两处调用透传（与 function calling 可叠加）。
  - `verify-services.js` +4 断言（42→46）：思考引导文案 1 条 + buildChatBody 3 条（默认无 keys / tools+medium 写入 / 非法枚举忽略）。
- 与计划偏差：无；真实 `mock:false` 链路仍待 Key 实测（代码路径由 buildChatBody 断言覆盖请求体组装）。
- 验证证据：verify 46/46、e2e 8/8（EXIT=0）、web build 111ms。
- 放行结论：PASS。
### 执行记录：Wave 12（Mock 题库扩容 50 题 + 质检升级）
- 计划内容：用户反馈"Mock 数据不够，测试 10 个以上都没有"——`count` 上限 10 时多数模块出不满 10 题。
- 实际完成：
  - 扩容：五模块各 10 题共 50 条（言语 3→10、资料 4→10、判断 3→10、数量 3→10、常识 3→10），仅追加不改旧题；知识点覆盖各模块范围、难度三档混合、解析统一「故选 X」。
  - **历史事实修正**：此前文档（AI-CODING 错误 2）记"29 题/言语 16"，与实读代码不符——实际一直为 16 条（言语仅 3）；本轮以实读 + verify 为准修正口径与断言。
  - 质检升级：`verify-services.js` 断言 45→47——「每模块 ≥10 题且 count=10 出满」「mockBank 全量过 B1 一致性守门（50 条 checkConsistency 零错误）」；原「判断推理应 3 题」更新为 10。
  - e2e 8→9 用例：新增「count=10 → 恰 10 题且字段完整」。
- 与计划偏差：无。题库由 worker 子代理质量红线自检 + 本波 B1 全量守门双重把关，无坏题放行。
- 验证证据：verify 47/47、e2e 9/9（EXIT=0）、web build 107ms。
- 放行结论：PASS。

### 执行记录：Wave 13（团队并行扩容至 150 题）
- 计划内容：用户反馈"题库只有一半"并激活 team 集群模式——目标五模块各 30 题、总量 150。
- 实际完成（team 管线：plan → exec → 合并 → verify）：
  - **team-plan**：5 worker 并行、各写独立 JSON（`.omc/w12-题库/<模块>.json`）规避共享文件并发写（AI-CODING 错误 4 教训）；新题 id 11~30 避开既有 1~10；难度 7/7/6。
  - **team-exec**：5 个 coder 集群并行产出，每模块 +20 题（合计 +100）；worker 各自 ESM 等价自测全绿；知识点覆盖各模块范围、解析含「故选 X」。
  - **lead 合并**：统一校验（结构/id/难度/选项四键唯一/解析声明=answer）→ 合并进 `mockData.js` _bank；期间检出**合并诱发缺陷**（JSON 条目缺数组逗号 → SyntaxError）由 `node --check` 定向补逗号修复；**样式差异记录**：新 100 题「故选 X」位于解析句中（后有干扰项补充），非句尾——不影响 B1 一致性校验（正则提取声明）与 `shuffleOptions` 同步（替换首处），按非缺陷记录。
  - **verify 升级**：断言值升级——每模块 ≥30、mockBank=150、判断推理筛选=30（47 项不变）；e2e 9 用例不变。
  - **实测**：`count=10` 两次请求各返 10 题且题干串不同（150 题库随机差异）；裸跑命中新增题（数量关系·水管工程）。
- 与计划偏差：worker 自测命令含 ESM 下 `require` 报错（改等价 import 执行）；服务实测遇 3001 残留进程与启动竞态（探活后重测通过，非代码缺陷）。
- 验证证据：verify 47/47、e2e 9/9（EXIT=0）、web build 100ms；count=10 双请求实测。
- 放行结论：PASS。

### 执行记录：Wave 14（Windows 部署适配 + 缺陷修复）
- 计划内容：按《黑龙江省考AI出题Agent_Windows部署修复清单_交Trae.md》工单执行——唯一部署目标 Windows；修复 P0（部署阻塞）与 P1（功能健壮性）缺陷，并修正 P2 文档一致性，最后跑 §8 验收命令清单并留存输出。
- 实际完成：
  - **P0-2 生产同源托管（方案 A）**：`server/src/index.js` 在 `/api` 之后、404 之前挂载 `web/dist`（`express.static` + SPA 回退 regex 仅匹配非 `/api`），`/api/*` 未匹配仍保持 JSON 404 契约；仅当 `dist` 存在时托管，否则打印明确日志。
  - **P0-3 Node 版本**：`web/package.json` 新增 `engines: {"node":"^20.19.0 || >=22.12.0"}`；仓库根新增 `.nvmrc`（内容 `22`）。
  - **P0-4 换行符**：新增 `.gitattributes`（`* text=auto eol=lf` + 常见二进制 `binary`）。
  - **P0-5 中文乱码**：全部 `.bat` 首行 `chcp 65001 >nul`。
  - **P0-6 一键脚本**：新增 `start-server.bat` / `start-web-dev.bat` / `build-web.bat` / `verify-all.bat`（用 `%~dp0` 推导路径、不硬编码 `D:\demo`、检查 `server\.env` 存在并提示 Mock 模式、日志重定向 `logs\server.log`）。
  - **P1-1 超时可配置 + 降级可见**：`env.js` 新增 `llmTimeoutMs`（`LLM_TIMEOUT_MS` 默认 30000）；`generate.js` 传 `timeoutMs: env.llmTimeoutMs`；Mock 兜底响应附带可选诊断字段 `mockReason`（`TIMEOUT/NO_KEY/VALIDATION_FAILED/EMPTY_CONTENT/HTTP`），已登记入 `DATA_SCHEMA.md` §3。
  - **P1-2 推理模型空 content 分类**：`callLLM.js` 新增纯函数 `classifyEmptyContent`（content 空且 finish_reason='length' → `EMPTY_CONTENT` 独立分类，可重试）；`buildChatBody` 支持可选 `max_tokens`（`LLM_MAX_TOKENS`，缺省不写入）；**新增 4 条断言 → verify 基线 47→51**。
  - **P1-3 explain 前端接入**：`ResultPanel.vue` 解析区新增「追问讲解」按钮，调 `POST /api/explain` 把 `{ explanation }` 就地渲染；`DATA_SCHEMA.md` 新增 §5 ExplainRequest/ExplainResponse；`COMPLIANCE.md` B3 由"未接线"改为"已接线"。
  - **P1-5 CORS/body 可控**：`CORS_ORIGIN` 白名单（未配置保持宽松）；`express.json({ limit: BODY_LIMIT || '1mb' })`。
  - **P1-6 日志落盘**：`.bat` 默认 `npm start >> logs\server.log 2>&1`；`.gitignore` 已含 `*.log` 并新增 `logs/`。
  - **P2 文档一致性**：README（51 项/e2e 9/150 题/模型名/路径/未完成项声明）、COMPLIANCE.md（顶部 Wave 14、51 项、B3 已接线、未实测→已实测）、AI-CODING（工具表 27/28 + 本执行记录）同步修正；历史波次断言数为当期值保留并加顶部说明。
- 与计划偏差：断言基线实为 **51**（工单记载 47，新增 P1-1/P1-2 断言后合规提升，已在文档明确声明）；`server/.env` 已由人工配置真实 Key，真实链路实测通过（count=3/5/10 均 mock:false）。
- 验证证据：`npm run verify` 51/51；`node test/e2e.mjs` 9/9 PASS；`web npm run build` 零错误；`verify-all.bat` 三项全过；`curl /api/generate`（无 Key 场景）mock:true + 字段齐全。
- 放行结论：PASS。

---

## 3. AI 生成 vs 人工设计的分界

判断口径（三问）：
1. 该部分是否属于"模式化、可样板化"的实现 → 大概率 AI 生成；
2. 该部分是否决定了系统的正确性边界/鲁棒性（如校验、兜底、Schema）→ 大概率人工设计，AI 只做实现；
3. 该部分是否需要在"先闭环、再加分"之间做取舍 → 人工决策。

| 模块 / 产物 | AI 生成部分 | 人工设计部分 | 判断依据（简要） |
|---|---|---|---|
| 项目总纲 / 波次编排 | 文档排版、目录骨架 | 波次顺序（文档→脚手架→后端→前端→回归→收尾）、"先闭环再加分"边界、C1~C6 硬约束 | 编排与约束决定交付成败，AI 只做实现与记录 |
| server 脚手架 | Express 骨架、中间件装配、ESM 配置 | 目录分层（config/routes/services）、统一错误体 `{error:{code,message}}` 约定、Key 仅存服务端 | 分层与错误契约是架构约束（C1） |
| parseRequirement | 正则模式与别名表机械写法 | 模块白名单、显式字段覆盖 NL 的优先级、默认值策略 | 覆盖优先级涉及产品语义（C3） |
| validateQuestions | 剥 JSON / 解析 / 规则实现的机械写法 | **校验四层设计**（JSON→字段→答案→一致性）+ B1 一致性规则口径（完全重复/声明冲突=error、超长子串=warning） | 正确性边界必须人工定口径（C3） |
| Mock 兜底链 | 题库数据与取样函数 | **降级次序**（无 Key→超时→校验失败→Mock；mock:true 标识）| 兜底次序是系统鲁棒性设计（C4） |
| callLLM | fetch + AbortController + 重试样板 | 30s 超时、无 Key 直接判定、错误 message 不含 Key | 密钥安全边界人工设计（C1） |
| 前端组件 | 模板 / 样式 / 事件绑定样板 | **C2 渲染剥离**（displayQuestions 仅 id/question/options/knowledgePoint）；追加模式不清空已选答案的交互语义 | 答案隐藏是硬约束（C2），交互语义人工定 |
| 回归 R1~R4 修复 | 各修复点的代码实现 | 缺陷分级（400/503 状态码语义、防连点守卫位置、错误归一策略） | 状态码与守卫语义人工定 |
| 加分项 B2 | excludedQuestions 过滤实现、追加模式代码 | "过滤后为空则保留原列表"契约保底、append 不清 answers | 契约保底是人为决策（防空响应破坏 GenerateResponse） |

**结论**：本项目的"正确性边界"（校验口径、兜底次序、Schema 语义、C1~C6）全部为人工设计，AI 承担了约 80% 的机械实现量（脚手架、正则、组件、文档排版），并通过波次间验证把实现错误兜回（见 §4）。

---

## 4. AI 错误记录表（关键）

> 本表全部为开发过程实时补录（验证暴露 / 交付自查），无一条为事后回忆编造。

| 序号 | 时间 | 所在波次 | 错误描述 | 发现方式 | 修正方式 | 遗留影响 / 教训 |
|---|---|---|---|---|---|---|
| 1 | 2026-09-22 | Wave 2（C2.1） | `parseRequirement` 初版的自然语言解析结果与显式配置/别名表不归一：`exam`/`subject` 组合在 "黑龙江省考行测"、"省考" 等输入下输出不一致，且无别名归一层 | curl 实测（混合自然语言 + 显式配置时 exam/subject 输出漂移） | parseRequirement 增加别名映射与归一逻辑：exam 别名统一为「黑龙江省考」、subject 缺省补「行测」，显式字段优先 | 已闭环；教训：解析层必须先定"归一白名单"再写正则 |
| 2 | 2026-09-22 | Wave 3（C3.1） | Mock 题库初版仅有 3 个模块，`MODULE_KNOWLEDGE` 无法覆盖行测五大模块，用户选「判断推理/数量关系/常识判断」时无题可出 | `npm run verify` 原子验证断言失败 | 补齐 mockData 至 5 模块全覆盖（言语理解 16 / 资料分析 4 / 判断推理 3 / 数量关系 3 / 常识判断 3，共 29 题） | 已闭环；教训：Mock 库必须在 Wave 2 即按"模块全覆盖"验收，勿等前端联调才发现 |
| 3a | 2026-09-22 | Wave 4 回归（R1/R2b） | `POST /api/generate` 对 body 中显式非法的 `module`（不存在模块）与 `count`（99 / "abc"）未做服务端校验，直接返回 200 且行为未定义 | curl 实测（非法入参未返回 4xx） | 增加 `_validateExplicitOverrides`：显式非法 module/count → 400 统一错误体 `{error:{code,message}}`；空 body 仍 200 默认值 | 已闭环；教训：显式入参必须服务端校验，不能只靠前端约束 |
| 3b | 2026-09-22 | Wave 4 回归（R3） | 前端生成过程中重复点击出题按钮可并发发起多个请求（无守卫） | 回归清单代码走查 | `_runGenerate` 顶部 `if (generating.value) return` + 按钮 `:disabled="generating"` 双保险 | 已闭环（代码级，未做浏览器自动化复核） |
| 3c | 2026-09-22 | Wave 4 回归（R4） | 前端 `postJSON` 对非统一错误体（HTML 错误页 / 空响应）直接 `response.json()` 抛异常，界面无兜底 | curl 直测 postJSON 三场景 | `_normalizeHttpError`：非统一错误体 → `NETWORK_ERROR`（503 网络异常提示），统一错误体透传 | 已闭环；三场景全过（连接拒绝→503、502 非 JSON→503、400 统一体→透传） |
| 4 | 2026-09-22 | Wave 5（C5.2b） | B2「再来一道类似」集群投放时，AgentSwarm 的 prompt 模板正文写死了 B1 指令，`{{item}}` 仅出现在标题占位 → 两个 agent 都实现 B1 且**并行写同一文件**，B2 未开发 | 交付自查（两 agent 汇报内容相同、B2 无产出、B1 文件被双写） | 单 Agent（coder）按精确原子提示词补做 B2（后端硬过滤 + 前端追加模式），并复核 verify/build/curl；B1 文件双写后重新 verify 确认未损坏 | 已闭环；教训：**AgentSwarm 模板的正文占位必须覆盖任务描述本身**，单原子任务不应开 swarm；共享文件不应并行署名 |
| 5 | 2026-09-22 | Wave 0（首次集群） | 首次调用 AgentSwarm 未提供 `description` 参数，工具调用被拒绝 | 工具调用返回拒绝 | 补 `description` 后重投；后续每次 Agent/AgentSwarm 均带 description | 已闭环；教训：集群参数先校验工具契约再投递 |
| 6 | 2026-09-22 | Wave 6（界面原子性审计） | 「再来一道类似」按钮带冗余 `v-show="displayQuestions.length > 0"`，与所在 action-bar 外层 `v-if="displayQuestions.length"` 双重控制（重复声明） | UI 原子性走查（grep @click/v-show 全量核验） | 删除内层冗余 v-show；保留 handleAnotherSimilar 内部空列表守卫（防直调） | 已闭环；教训：同一显隐意图只保留一层控制，外层容器条件足够时内层按钮不再重复声明 |
| 7 | 2026-09-22 | Wave 6（C 审计） | 前端可视走查受限：环境无 Playwright MCP（仅 charts/filesystem/mermaid），无法做浏览器级自动化点击验证 | 工具清单核验 | 降级为代码级原子性审计（按钮 handler 全量核验 12 处 + build + e2e），并在文档如实声明无浏览器自动化 | 已声明（README §9 / COMPLIANCE §3）；教训：无浏览器自动化时以"handler 存在性 + 契约测试"覆盖按钮原子性 |
| 8 | 2026-09-22 | Wave 8（最终验证） | `App.vue handleAnotherSimilar()`（B2「再来一道类似」）读取 `formState.value.module/.difficulty`，而 `formState` 为 `reactive` 对象（无 `.value` 属性）→ `undefined.module` 抛 TypeError，「再来一道类似」按钮点击即崩，B2 功能整体不可用 | 最终验证代码走查（reactive 内建产物却以 ref 语法访问；e2e 契约测试只打 API 不覆盖 Vue 组件，故此前各波次未触发） | 最小修复两处：`formState.value.X` → `formState.X`（与同文件其余函数写法一致）；`npm run build` 复核通过；登记 BUG-009 状态 CLOSED | 已闭环；教训：**reactive 与 ref 的取值语法不可混用，含 UI 交互的函数须纳入与契约测试同级的走查清单**（e2e 覆盖不到组件内部） |
| 9 | 2026-09-22 | Wave 9（verify 重构） | `ok()` 断言函数由同步改为 async（为支持 questionBank 异步用例）后，顶层调用未 `await`：主流程在全部用例执行完之前就打印汇总行（结果显示 0 项通过、退出码判断前置失真） | 重定向输出对拍发现（`/tmp/w9verify.log` 结果行先于 ✓ 行、passed=0 但实际 40 个 ✓） | 整个 verify 主体包入 `async function main()`，40 处用例全部 `await ok()`，汇总与退出码判定移到 `await main()` 之后 | 已闭环；教训：**async 化公共断言函数必须同步改造全部调用点（await），否则"顺序执行"假设被微任务调度打破** |

**复核结论**：错误 1~7 全部已完成修正并经原子验证（verify 32 项全绿 / e2e 8 组 EXIT=0 / build 零错误 / B2 curl 实测排除集命中 0），无遗留未修的 AI 错误。

---

## 5. 若再给 1 天优先改什么

### 5.1 实际决策（本次 Wave 5 已执行）

| 候选 | 本期实际投入 | 结果 |
|---|---|---|
| B1 校验强化 | ✅ 投入（Wave 5.2a） | 选项完全重复 / 解析声明冲突 → 判不通过；互为超长子串 → warning 复核；verify 32 项全绿 |
| B2 再来一道类似 | ✅ 投入（Wave 5.2b，经错误 4 返工后） | 排除集硬过滤 + 追加模式；curl 实测排除集命中 0 |
| B3 追问讲解 | ❌ 未投入（本期） | 无 Key 下无真实讲解价值，留待配 Key 后低成本完成 |
| B4 学习统计 | ✅ 已含于 Wave 3 | localStorage `hlj-kaoqa-stats`：做题数 / 正确率 / 薄弱知识点 |
| B5~B7 难度自适应 / 去重 / 生成过程 | ❌ 未投入 | 均为体验增强，不优先于核心闭环 |

**与基准优先级的分歧及原因**：按开发流程基准，B1/B2/B3 为优先档；本期因无 Key，B3（依赖真实模型讲解）延后，B1/B2（纯校验与链路增强，Mock 亦可验）按计划完成。

### 5.2 若再给 1 天（候选与依据）

| 优先级 | 候选 | 内容提要 | 预计投入 | 依据 |
|---|---|---|---|---|
| 1 | 真实 LLM 链路实测 | 获取任一 OpenAI 兼容 Key，端到端验证 `mock:false` 分支（生成质量、四层校验、重试、超时回退） | 0.5 天 | 当前最大验证空白（C6：未验证不标完成） |
| 2 | B3 追问讲解 | `/api/explain` 通俗化讲解（无 Key 模板版已具备骨架） | 0.2 天 | 配 Key 后即完 |
| 3 | 浏览器自动化 | Playwright 覆盖全流程（出题→作答→判题→再来一道），补 R3 的 UI 级复核 | 0.3 天 | 回归清单中唯一代码级验证项 |
| 4 | Mock 题库扩容 | 每模块扩至 8~10 题，弱化重复，增强「再来一道」区分度 | 0.3 天 | 已知限制 2（README §9） |
| 5 | 难度自适应 B5 | ResultPanel↔ConfigForm 联动升/降档 | 0.4 天 | 演示亮点，成本中等 |

---

## 附：与项目约束的一致性自查

- 本文件不含任何 API Key、模型密钥或前端可见的敏感信息（约束 C1）。
- 第 4 节记录涉及"答案可见性"处以 C2 为准（渲染层剥离答案），未把"答案暴露"写成可接受实现。
- 所有涉及 Schema/接口的描述引用《开发流程_黑龙江省考AI出题Agent.md》与 `docs/DATA_SCHEMA.md`/`docs/API.md`，未自行发明字段（C3）。
- 全部"已完成"标注均有 §2 验证证据与 §4 复核结论支撑（C6）。