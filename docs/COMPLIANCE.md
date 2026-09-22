# 需求符合性对照（COMPLIANCE）

> 对照基线：任务需求文档《全栈开发测试任务_黑龙江省考AI出题Agent_3小.docx》（共 16 节，已全文抽取核对）。
> 本文件按「需求条目 → 实现位置 → 验证方式 → 结论」四段式逐条映射，是本项目交付符合性的唯一裁决依据。
> 最后核对：Wave 5.3（定稿）／Wave 5.4（终检）／Wave 6（Apple 风格 UI）／Wave 7（A 级文档族 24 份 01~05 + 全量验证）／Wave 8（最终验证：前后端一致性 + 硬编码审计 + BUG-009 修复，verify 32 / e2e 8 / build 106ms）／Wave 9（function calling 去硬编码：questionBank 动态检索 + 工具往返，verify 40 / e2e 8 / build 100ms）／Wave 10（交付比对：Mock 随机化——随机抽样 + 选项乱序，verify 42 / e2e 8 / build 102ms，docx 190 段逐条核对）／Wave 11（LLM 思考增强：内部推演引导 + reasoning_effort 透传，verify 46 / e2e 8 / build 111ms）／Wave 12（Mock 题库扩容：五模块各 10 题共 50 条 + B1 全量守门，verify 47 / e2e 9 / build 107ms）／Wave 13（团队并行扩容至 150 题：五模块各 30，count=10 双请求实测不同，verify 47 / e2e 9 / build 100ms）。

---

## 0. 核对基线说明

| 项 | 值 |
|---|---|
| 需求文档 | `全栈开发测试任务_黑龙江省考AI出题Agent_3小.docx` |
| 抽取方式 | python3 + zipfile（document.xml 全文 → 16 节） |
| 抽取时间 | Wave 5（与本文件同步核对） |
| 抽查结论 | 抽取文本与 docx 结构一致，无缺失章节 |

---

## 1. 需求 → 实现逐条矩阵

### 1.1 任务背景 / 时间范围 / 目标用户（docx §1~3）

| 需求条目 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| 面向开发者的全栈 Demo | `README.md` §1、`docs/ARCHITECTURE.md` | 文档审阅 | ✅ |
| 3 小时限时（本计划按 ~90 分钟） | `docs/CLUSTERS.md`、`AI-CODING.md` §1 时间盒 | 文档审阅 | ✅ |
| 目标用户：备考黑龙江省考行测的考生（演示用途） | Mock 题库题干均贴合行测题型；UI 文案面向考生 | 文档 + 用例审阅 | ✅ |

### 1.2 核心功能 1~4（docx §4）

| 需求条目 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| 1. 可视化配置出题（考试地区/考试类型/科目/模块/难度/题量） | `web/src/components/ConfigForm.vue`——考试地区(黑龙江省)/考试类型(省考)/科目(行测)为**固定只读展示**(FIXED_LABELS),可调字段为 模块/难度/题量 三项(Wave 10 复核修正:原"6 字段"表述与实现不符) | e2e 用例 1、3；`npm run verify` | ✅ |
| 2. 自然语言→参数解析出题 | `server/src/services/parseRequirement.js`（考试/科目/模块/难度/题量/知识点逐项正则 + 别名表） | verify 用例（NL 解析）、e2e 用例 4 | ✅ |
| 3. 生成与展示（题干/选项/解析，答案对考生隐藏） | `web/src/components/QuestionCard.vue`；渲染层剥离 `answer`/`analysis` | e2e 用例 3、6；前端 UI 审阅 | ✅ |
| 4. 答题与判题 | `web/src/App.vue`（作答选择 + 提交判题 + 逐题对错/解析展示） | e2e 用例 6 | ✅ |

### 1.3 Agent 要求：七步出题流程（docx §5）

| 步骤 | 实现位置 | 结论 |
|---|---|---|
| ① 配置读取（表单/自然语言） | `parseRequirement.js`（合并 overrides + NL 解析） | ✅ |
| ② 组装提示词（系统角色 + 约束） | `server/src/services/buildPrompt.js:35`（出题老师角色 + 结构化约束） | ✅ |
| ③ 调用 LLM | `server/src/services/callLLM.js`（OpenAI 兼容协议；NO_KEY/超时/网络错误分类；可重试） | ✅ |
| ④ 解析与四层校验 + 修复 | `server/src/services/validateQuestions.js`（修复→校验→坏题剔除→好题保留） | ✅ |
| ⑤ 结构化返回 | `routes/generate.js`（统一 `GenerateResponse`；B2 硬去重；`id` 用 uuid 重生成保证唯一） | ✅ |
| ⑥（LLM 失败）Mock 兜底保闭环 | `callLLM.js` NO_KEY → `generate.js` 路由 → `mockData.js` | ✅ |
| ⑦ 前端渲染与判题 | `App.vue` + `QuestionCard.vue` + `ResultPanel.vue` | ✅ |

### 1.4 题目质量与结构化输出（docx §6~7）

| 需求条目 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| 题目质量：四层校验（字段/一致性/选项/答案） | `validateQuestions.js`（`_checkQuestion` / `checkConsistency` / `repairQuestion`） | verify 32 项断言 | ✅ |
| 一致性强化（解析答案 vs answer 冲突判不通过） | `validateQuestions.js`（加分 B1） | verify + e2e 用例 7 | ✅ |
| 结构化输出契约（单题字段 / 试卷响应 / 错误响应） | `docs/DATA_SCHEMA.md` §3；`routes/generate.js` 统一响应 | e2e 全用例断言字段 | ✅ |

### 1.5 异常与稳定性（docx §8，六项）

| 需求条目 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| LLM 超时/网络异常 | `callLLM.js`（TIMEOUT/HTTP/NETWORK 分类 + 重试 1 次） | 代码审阅 | ✅ |
| 未配置 Key（Mock 兜底，无 Key 也能跑） | `callLLM.js:66-69` NO_KEY → 路由 Mock 兜底 | e2e 用例（默认走 Mock） | ✅ |
| LLM 返回非法 JSON | `validateQuestions.js`（`_extractJsonText` 剥 JSON 块）→ 解析失败走 Mock | verify | ✅ |
| 坏题剔除 / 数量不足 | `validateQuestions.js` 逐题处理 + `mockData.js` 池回填 | verify + e2e 用例 2 | ✅ |
| 非法参数（module/count 越界） | `routes/generate.js:99-102` → 400 统一错误结构 | e2e 用例 5 | ✅ |
| 重复 / 近似题干 | B2 排除集硬去重（生成后过滤 + 空集保留原列表） | e2e 用例 8 | ✅ |
| 接口超时/失败页面不白屏 | 错误条 + 「重试」按钮（`App.vue` error 态）；前端网络层归一 503 | e2e 用例 5；REGRESSION R4 | ✅ |
| 用户连续点击不重复提交/不失控 | `App.vue` `generating` 守卫 + ConfigForm 按钮 disabled（Wave 10 复核补记条目） | REGRESSION R3；代码走查 | ✅ |
| API Key 不写死在前端（C1） | Key 仅存 `server/.env`；前端零感知（`web/src` 无任何 Key 引用） | W3 全库扫描 0 命中 | ✅ |
| README 说明异常的处理方式 | `README.md` §9 已知问题清单（如实声明） | 文档审阅 | ✅ |

### 1.6 技术要求 / 完成顺序 / 最终交付（docx §9~11）

| 需求条目 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| 前端框架 + 后端服务 + API 设计 | Vue 3 + Vite（`web/`）；Express（`server/`）；REST API 文档 `docs/API.md` | 双端可构建可启动 | ✅ |
| 无 LLM Key 可运行 | Mock 兜底 + 五模块题库 | e2e 全绿 | ✅ |
| 完成顺序：核心闭环 → 稳定性 → 交付 | `docs/CLUSTERS.md` Wave 0→5 波次 | 波次记录齐全 | ✅ |
| 交付物：源码 | `server/` + `web/`（git 目录就绪） | 结构审阅 | ✅ |
| 交付物：可运行 Demo | 双端启动命令 `README.md` §3；Mock 模式跑通 | e2e + build | ✅ |
| 交付物：README / AI-CODING 记录 | `README.md`、`AI-CODING.md`（已含 Wave 0~5 全部记录） | 文档审阅 | ✅ |
| 交付物：提交说明（简短提交信息） | `README.md` §10.2 提交信息模板（项目名/代码地址/Demo/启动方式/模型状态/已完成/未完成） | 文档审阅 | ✅ |

### 1.7 加分项（docx §12）

| 加分项 | 实现位置 | 验证 | 结论 |
|---|---|---|---|
| B1: 题目校验与修正强化 | `validateQuestions.js`（选项完全重复→不通过；解析 vs answer 冲突→不通过；互为超长子串→warning） | e2e 用例 7 | ✅ 已完成 |
| B2: 再来一道类似（排除集 + 知识点 + 难度续出） | `App.vue:102` + `routes/generate.js`（B2 硬去重） | e2e 用例 8 | ✅ 已完成 |
| B3: 再简单讲一遍（追问讲解） | 后端 `server/src/routes/explain.js`（有 Key 走 LLM，无 Key 模板兜底）已就绪；**前端无入口按钮，未接线** | 代码审阅 | ⚠️ 后端就绪 / 前端未接线（非最低要求） |
| B4: 学习统计（对错/知识点薄弱） | `web/src/components/stats.js` + ResultPanel 统计区 | e2e 用例 6（作答后统计） | ✅ 已前置完成 |
| 按连对/连错动态调难度 | 未实现（README §9 已如实标注） | — | ❌ 未做（非最低要求） |
| 流式生成 / 明确的生成过程状态 | `App.vue` 三步骤加载指示（解析需求 → 调用模型 → 校验题目），非流式（Wave 10 复核补记条目） | 前端 UI 审阅 | ✅ 过程状态已实现（流式未做，非最低要求） |

### 1.8 请避免的做法（docx §14，共 7 条）与最低标准（docx §15）

逐一核对（Wave 10 复核修正：需求原文 §14 为 7 条 bullet，原文"十四项"系笔误，现按 7 条逐条映射）：

| # | 避免做法 | 核对结论 |
|---|---|---|
| 1 | 只做一个聊天框，让模型输出一整段题目文本 | ✅ 未踩（结构化 JSON + 题卡渲染，非聊天流） |
| 2 | 为页面丰富做大量与核心任务无关的页面 | ✅ 未踩（单页三区块，无冗余页面） |
| 3 | 把答案一开始显示在题目下面 | ✅ 未踩（C2 渲染层剥离，提交前零暴露） |
| 4 | 前端写死几道题却声称 Agent 实时生成 | ✅ 未踩（真实链路七步 + Mock 兜底 `mock:true` 明示；Wave 10 Mock 已随机化） |
| 5 | API Key 直接暴露在前端 | ✅ 未踩（C1，全库扫描 0 命中） |
| 6 | 为体现"黑龙江"编造政策/题型/数据 | ✅ 未踩（C5：通用行测规范 + Demo 范围标识） |
| 7 | 项目只能在本人电脑运行，无 README/依赖/环境变量说明 | ✅ 未踩（README §4 从零启动 + `.env.example`） |

- 最低标准（可运行 Demo + 核心闭环 + 需求符合）→ 本矩阵结论均为 ✅（除两处已声明的非最低要求差异）。

### 1.9 验收操作 / 口头说明（docx §16，Wave 10 复核补全逐条）

| 验收操作（我们实际操作） | 实现位置 / 验证 | 结论 |
|---|---|---|
| 项目能否正常启动 | README §4 双端启动；e2e 自启被测服务 | ✅ |
| 是否能够选择或输入黑龙江省考练习需求 | ConfigForm 下拉 + NL textarea；parseRequirement 识别 | ✅ |
| Agent 是否能正确理解基本需求 | verify NL 解析 8 用例（地区/模块/知识点/题量/难度） | ✅ |
| 是否能生成完整题目，而非普通聊天文本 | 结构化 GenerateResponse；e2e 用例 3 字段完整 | ✅ |
| 题干、四个选项、答案和解析是否完整 | verify 逐题断言 + e2e 用例 3 | ✅ |
| 用户是否能够实际点击选项并提交 | QuestionCard 点选 + 提交判题（e2e 用例 6 覆盖判题口径） | ✅ |
| 判题结果是否正常，答案是否在作答前隐藏 | C2 剥离（DOM 零暴露）+ ResultPanel 提交后展示 | ✅ |
| 模型或接口异常时页面是否有基本处理 | 错误条 + 重试 + 503 归一（REGRESSION R4） | ✅ |
| README 是否足够让其他人重新运行 | §4 从零启动清单；§5 环境变量；§6 模型配置 | ✅ |
| 候选人能否解释 Agent 流程/关键代码/AI Coding 过程 | AI-CODING.md 全量可复盘 + 本报告口头说明 | ✅ |

| 口头说明问题（简短回答） | 落点 |
|---|---|
| 产品的 Agent 具体做了什么 | 七步流水线（解析→定参→Prompt→调模型→校验→结构化→判题解析），见 `docs/ARCHITECTURE.md` §3 |
| 如何减少模型错误答案/错误解析/格式错误 | 四层校验 + B1 一致性（选项重复/解析冲突拒收）+ 重生成 ≤2 次 + Mock 兜底 |
| 不是 5 道而是每天大量题目时如何调整架构 | `ARCHITECTURE.md` §5.3：队列化/去重缓存/限流/存储落库/质量抽检 |
| 3 小时里最难的问题和解决方式 | `AI-CODING.md` §4 错误 1~9（双写、async 时序、reactive 误用等） |
| AI Coding 节省了什么、哪里容易带偏 | `AI-CODING.md` §3 分界表：机械实现约 80% 由 AI 承担；正确性边界/校验口径人工定 |

---

## 2. 验证矩阵（原子测试，全部可零依赖复现）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 后端单元 + 服务层断言（32 项） | `cd server && npm run verify` | ✅ 全绿 |
| 端到端原子测试（8 组用例，退出码 0=通过） | `cd server && node test/e2e.mjs` | ✅ 8/8 PASS，EXIT=0 |
| 前端生产构建 | `cd web && npm run build` | ✅ 基线绿（vite 82ms） |
| Wave 6 Apple 风格回归：三分支验证 | `server/verify` + `e2e` + `web/build` | ✅ 32/32、8/8、build 绿 |
| Wave 7 A 级文档族 + 全量验证 | `server/verify` + `e2e` + `web/build` | ✅ 32/32、8/8、101ms；文档族 24 份齐全 |
| Wave 8 最终验证（一致性/硬编码审计/文档 + BUG-009 修复） | `server/verify` + `e2e` + `web/build` | ✅ 32/32、8/8、106ms（BUG-009 修复后重跑） |
| Wave 9 function calling 去硬编码 | `server/verify` + `e2e` + `web/build` | ✅ 40/40（六分组）、8/8、100ms |
| Wave 10 team 复核（文档族/需求矩阵/契约一致性） | 4 路并行复核 + 修复后全量重跑 | ✅ 文档族 24 份 100% 合规；矩阵补全 6 处缺口；`MOCK_MODULES` 顺序对齐白名单；verify 42 / e2e 8 / build ✅ |
| Wave 11 LLM 思考增强（A 思考引导 + B 推理参数） | `server/verify` + `e2e` + `web/build` | ✅ 46/46（buildChatBody 3 条 + 思考引导 1 条）、8/8、111ms |
| Wave 12 Mock 题库扩容 50 题 + 质检升级 | `server/verify` + `e2e` + `web/build` | ✅ 47/47（≥10 题/count=10 满额/B1 全量守门）、9/9（新增 count=10 用例）、107ms |
| Wave 13 团队扩容至 150 题（五模块各 30） | `server/verify` + `e2e` + `web/build` + count=10 双请求实测 | ✅ 47/47（≥30/150 条）、9/9、100ms；两次请求题目不同 |
| 需求文本抽取核对 | python3 + zipfile（本文件 §0） | ✅ 16 节无缺失 |

---

## 3. 未验证项与风险（如实声明）

1. **真实 LLM 链路未实测**：环境无 `LLM_API_KEY`，`mock:false` 分支仅代码路径完整（协议/重试/四层校验均实现），未做端到端实测。配置 Key 后无需改代码即可切换。
2. **加分项 B3 前端未接线**：`/api/explain` 后端就绪，前端无「再简单讲一遍」按钮（非最低要求，README 已标注）。
3. **无浏览器级自动化**：防连点（R3）等为代码级守卫，未配 Playwright 驱动测试；Wave 6 计划以本地服务 + fetch 的 e2e 覆盖主链路。
4. **按连对错调难度未实现**：非最低要求，README §9 已标注。

---

## 4. 结论

- 核心功能 1~4、Agent 七步流程、结构化输出、异常六项、Mock 兜底、最终交付物：**全部 ✅**。
- 加分项 B1/B2/B4：**已完成**；B3：后端就绪前端未接线；难度动态调整：未做（均已声明）。
- Wave 8 最终验证（2026-09-22）：前后端一致性核对、硬编码审计、文档↔代码一致性复核全部 PASS；期间检出并修复 BUG-009（「再来一道类似」reactive 误用 `.value`），verify 32/32、e2e 8/8、build 106ms 修复后重跑全绿。
- 最低标准满足：可运行 Demo（Mock 保闭环）+ 核心业务闭环 + 需求符合性本文件可审计。