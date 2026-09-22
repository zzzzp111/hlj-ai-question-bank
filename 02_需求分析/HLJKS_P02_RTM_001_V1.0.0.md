# 需求追溯矩阵（RTM）

- **文档标识号**：HLJKS-RTM-001-V1.0
- **状态**：BASELINED（交付基线；V1.0.0 全部条目状态见 §3）
- **范围**：任务书 docx 16 节 → 软件需求号（F/P/I）→ 实现位置 → 验证方法 → 状态双向往返

---

## 1. 追溯规则

- 需求编号规则：`F-功能 / P-性能 / I-接口`（见 SRS §4~§6、IRS §1）。
- 验证方法取值：`VT`（单元/原子 verify）、`VE`（集成 e2e）、`VB`（build/评审）、`VR`（走查评审）。
- 状态：✅ 已完成并通过 / ⚠️ 部分完成（已知限制）/ ➖ 未做。

## 2. 需求拆解矩阵（docx 16 节 → 软件需求）

| docx 节 | 原始要求 | 软件需求号 | 实现位置 | 验证 | 状态 |
|---|---|---|---|---|---|
| §1 任务背景 | 面向公考学习场景的 AI 出题产品 | 产品目标（SRS §1） | 全局 | VR | ✅ |
| §2 时间与范围 | 3h 完成闭环；优先级：核心链路>稳定>体验>页面 | DEV §4 波次表 | 项目计划 | VR | ✅ |
| §3 目标用户与典型场景 | 考生→NL 提需求→生成→作答→判题→解析 | US-01/03/04 | App.vue + routes | VE（用例 2/6） | ✅ |
| §4 核心功能 | 出题配置/NL 输入/生成展示/答题判题 | F-001~F-005 | ConfigForm/parseRequirement/QuestionCard | VT+VE | ✅ |
| §5 Agent/Workflow | 理解→定参→生成→校验→结构化返回→判题 | F-001/F-002/F-008、HLD §4 | services 五件套 | VT（buildPrompt 5 项） | ✅ |
| §6 题目质量 | 行测特征；不编造政策；题干-选项-答案-解析不矛盾 | F-008（B1） | validateQuestions/checkConsistency | VT（B1 5 项） | ✅ |
| §7 结构化输出 | 统一 JSON 结构渲染而非 Markdown | F-002、I-02 | routes/generate | VE（用例 2/3） | ✅ |
| §8 异常与稳定性 | 非法 JSON/缺字段/超时/连点/Key 不落地 | P-001、IRS §6（R3/R4） | callLLM/前端 client/防连点 | VE（用例 4/5） | ✅ |
| §9 技术要求 | 技术栈不限；可 Mock 但须说明替换点 | 技术栈（HLD §2） | server+web | VR | ✅ |
| §10 完成顺序 | 单题→结构化→展示判题→NL→校验→UI | DEV §4 Wave 0~6 | 项目计划 | VR | ✅ |
| §11 最终交付形式 | 源码+可运行 Demo+README+AI-CODING | README/AI-CODING/RN | 根目录 | VR | ✅ |
| §12 验收操作 | 启动/需求理解/完整题目/作答/判题/异常/说明 | F-001~F-005、STD §3 | e2e/manual | VE | ✅ |
| §13 可选加分 | B1 校验 / B2 再来一道 / B3 追问 / B4 统计 / B5 难度调整 / B6 流式 / B7 去重 | F-006/B1、F-007 | checkConsistency/排除集/stats.js | VT+VE | ✅ B1/B2/B4、⚠️ B3 后端就绪前端未接线、➖ B5~B7（见 §4） |
| §14 避免做法 | 禁止聊天框流式文本/答案前置/写死题目/Key 暴露/编造政策 | C1/C2/C3/C5 | COMPLIANCE §1 | VR | ✅ |
| §15 最低完成标准 | 闭环七步真正可点击 | F-001~F-005 | e2e 8/8 全绿 | VE | ✅ |
| §16 口头说明 | 能解释 Agent 做了什么/如何纠错/架构演进/难点/AI 节省 | PSR §5 | 总结报告 | VR | ✅ |

## 3. 反向往返：软件需求 → 来源与验证

| 需求号 | 来源 | 实现文件 | 主验证 | 状态 |
|---|---|---|---|---|
| F-001 | docx §4.1/4.2 | parseRequirement.js / ConfigForm.vue / App.vue | VT 8 项 + VE | ✅ |
| F-002 | docx §7 | routes/generate.js / DATA_SCHEMA.md | VE 用例 2/3 | ✅ |
| F-003 | docx §14 | QuestionCard.vue（答案隐藏） | VR 走查 + VB | ✅ |
| F-004 | docx §4.4 | App.vue 判题逻辑 | VE | ✅ |
| F-005 | docx §4.4 | ResultPanel.vue | VE | ✅ |
| F-006 | docx §13.2 | routes/generate.js 排除集 | VE 用例 7/8 | ✅ |
| F-007 | docx §13.4 | stats.js | VE + 走查 | ✅ |
| F-008 | docx §13.1/§6 | validateQuestions.js/checkConsistency | VT B1 5 项 | ✅ |
| P-001 | docx §8 | callLLM.js（30s/重试2） | VT + VE | ✅ |
| P-002 | — | web build | VB（101ms） | ✅ |
| I-01~I-03 | docx §7/§8 | routes/health|generate|explain | VE | ✅ I-01/02、⚠️ I-03 |
| C1~C6 | AGENTS.md | 全局 | VR（COMPLIANCE §1） | ✅ |

## 4. 已知限制登记（⚠️/➖ 项）

- **I-03 / B3-题目追问**：后端 `routes/explain.js` 已就绪，前端无入口（README §9.5）。
- **B5-按连对错调难度、B6-流式生成、B7-相似度去重**：加分项未做（时间盒内保基础闭环，见 PSR §4）。
- 中文数量词「一道」按未识别回落默认 3 题（README §9.4，缺陷根因见 AI-CODING 错误 1）。

## 5. 追溯确认

- 本矩阵与 `HLJKS_P02_SRS_001`（需求明细）、`HLJKS_P04_UTP/ITD/STD`（测试用例）、`HLJKS_P04_TSR`（执行结果）三向一致；若需求变更，先按 `HLJKS_P01_SCM_001 §4` 提变更再更新本矩阵。