# 软件需求规格说明（SRS）

- **文档标识号**：HLJKS-SRS-001-V1.0
- **状态**：APPROVED → 归属于 V1.0.0 交付基线（基线管理见 `01_立项规划/HLJKS_P01_SCM_001`）
- **需求来源**：任务书（docx 全 16 节）＋ 加分功能清单（docx §13）；完整性见 `HLJKS_P02_RTM_001`
- **验证基线**：`npm run verify`（32 项）＋ `node test/e2e.mjs`（8 组）＋ `web npm run build`（全绿）

---

## 1. 概述

本产品为**黑龙江省考 AI 出题 Agent Demo**：用户通过自然语言或可视化表单表达练习需求，后端解析为结构化参数，经 LLM（无 Key 时 Mock 双轨兜底）生成符合公考行测特征的题目，前端隐藏答案渲染、作答判题并展示解析。核心目标是跑通「需求理解 → 出题 → 答题 → 判题 → 解析」闭环（docx §15 最低完成标准）。

## 2. 用户故事（US）

| 编号 | 用户故事 | 验收标准 |
|---|---|---|
| US-01 | 作为考生，我直接说「我黑龙江省考资料分析比较差，给我出 3 道中等难度的增长率题」，就能得到符合我要求的题（docx §3） | 输入自然语言 → 识别 module=资料分析/难度=中等/count=3 → 返回 3 题结构化题目；字段缺失回落 `DEFAULT_CONFIG` 不报错 |
| US-02 | 作为考生，我也可以在下拉框里选择 黑龙江/省考/行测/模块/难度/题量 来出题（docx §4 核心功能 1） | 表单任一配置项可选；提交后生成对应数量题目；显式非法值返回 400 统一错误体 |
| US-03 | 作为考生，我点击选项提交后能看到对错、正确答案和解析（docx §4 核心功能 4） | 作答前页面无任何答案/解析文本；提交后标记正误并展示解析与知识点 |
| US-04 | 作为考生，我回答完后点「再来一道」，不会重复见到刚做过的题（docx §3 二次交互 + §13 加分项） | 新请求携带 `context.excludedQuestions`；返回题干与排除集交集为 0；重复请求的题目 id 不同 |

## 3. 痛点解析（P）

| 编号 | 痛点 | 本项目解决方案 |
|---|---|---|
| P1 | 手动组卷耗时：考生需自己找题、拼卷、对答案 | NL/表单双入口 → Agent 一次出题（F-001） |
| P2 | 答案暴露：多数练习页答案与题干同屏，干扰作答 | 答案隐藏渲染策略（F-003），答案字段仅在提交后注入 DOM |
| P3 | NL 与表单两套体系割裂、数据结构不一 | 双入口统一收敛到 `GenerateResponse` Schema（F-002，见 `docs/DATA_SCHEMA.md`） |
| P4 | 无 API Key 时产品无法演示 | Mock 双轨：`callLLM` 探测 NO_KEY → 路由级兜底 `mockData`（F-001，C4 约束） |

## 4. 功能需求（F）

> 编号规则：F-xxx；每条附验收标准；实现位置见 `HLJKS_P03_LLD_001`；接口契约见 `HLJKS_P02_IRS_001`。

| 编号 | 需求 | 验收标准 |
|---|---|---|
| F-001 | 双入口出题：可视化表单＋自然语言输入（docx §4.1/§4.2） | 两入口均返回统一 `GenerateResponse`；NL 识别地区/考试/科目/模块/知识点/题量/难度六要素中的任一部分，缺失字段用默认值（黑龙江省考/行测/资料分析/中等/3 题） |
| F-002 | 统一结构化输出：`{exam, subject, module, difficulty, questions[]}`（docx §7） | 每题含 `id/question/options(A~D)/answer/analysis/knowledgePoint`；字段类型与 `docs/DATA_SCHEMA.md` 一致；e2e 用例 2/3 通过 |
| F-003 | 答案隐藏渲染（docx §8 + §14 避免做法「把答案一开始就显示在题目下面」） | 未提交时 QuestionCard 组件 props 不含 answer/analysis；DOM 无可搜索到的答案文本（走查通过） |
| F-004 | 作答判题：点击选项提交后显示正确/错误（docx §4.4） | 单选校验；提交后按 answer 判定并标记；多题可连续作答 |
| F-005 | 解析展示：提交后显示正确答案与解析（docx §4.4） | answer/analysis/knowledgePoint 在提交后随 ResultPanel 展示 |
| F-006 | 再来一道（docx §13.2；本任务 B2） | 生成时按 `context.excludedQuestions` 硬去重；过滤后为空时回退原题保契约；两次相同请求题目 id 不同（e2e 用例 7/8） |
| F-007 | 学习统计：记录做题数、正确率、薄弱知识点（docx §13.4；B4） | 判题后写入 `localStorage['hlj-kaoqa-stats']`；统计区展示总数/正确率/薄弱知识点 |
| F-008 | 生成结果校验强化（docx §6 题目质量 + §13.1 Review/Check；B1） | 四层校验：结构→字段→修复→一致性；`checkConsistency` 三条规则（选项完全重复/解析-答案冲突 → 拒收；互为超长子串 → 警告）；verify B1 组 5 项通过 |

## 5. 性能需求（P）

| 编号 | 需求 | 验收标准 |
|---|---|---|
| P-001 | 接口响应时效：真实 LLM 30s 超时＋重试；Mock 即时（docx §8 异常与稳定性） | `callLLM` 超时阈值 30s、重试上限 2 次；无 Key 场景接口响应 < 1s（e2e 全组实测通过） |
| P-002 | 前端构建产物可复现 | `web npm run build` 成功（实测 101ms，vite 8.x） |

## 6. 接口需求（I）

- 全部 HTTP 接口契约见 `02_需求分析/HLJKS_P02_IRS_001`：`GET /api/health`、`POST /api/generate`、`GET /api/explain`（就绪未接线）、错误体 `{error:{code,message}}`。
- 数据 Schema 见 `docs/DATA_SCHEMA.md`；接口字段级说明见 `docs/API.md`。

## 7. 非功能约束（继承 AGENTS.md 强制约束 C1~C6，强制项见 `HLJKS_P01_SCM_001 §6`）

| 编号 | 约束 | 落实 |
|---|---|---|
| C1 | API Key 隔离 | Key 仅经 `server/.env` → `src/config/env.js` 读取，前端零 Key；走查通过 |
| C2 | 答案隐藏 | F-003 落实；build 产物中抽查无明文答案 |
| C3 | 统一 Schema | F-002 落实；前后端以 `GenerateResponse` 为唯一契约 |
| C4 | Mock 双轨 | P4 落实；响应含 `mock: boolean` 明确标记 |
| C5 | 不编造事实 | 黑龙江政策/题型规则不确定时不编造，产品内注明 Demo 范围（README §9） |
| C6 | 完成定义 | 变更须通过 verify/e2e/build 三绿方可收尾（见 SQA §4） |

## 8. 追溯

- 本条需求 → docx 原始章节的双向矩阵：`02_需求分析/HLJKS_P02_RTM_001`。
- 评审与质量门禁：`01_立项规划/HLJKS_P01_SQA_001`。