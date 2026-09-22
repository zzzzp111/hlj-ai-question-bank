# 详细设计说明 (LLD)

- **文档标识号**:HLJKS-LLD-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22
- **前置文档**:HLJKS-P03-HLD-001-V1.0.0

> 行号以 2026-09-22 实际源码为准,供二次开发定位;函数签名均可在 `server/src/` 对应文件内核对。

---

## 1. 服务层解析服务  `server/src/services/parseRequirement.js`

| 项 | 内容 |
|---|---|
| 导出 | `parseRequirement(text) -> { module, difficulty, count, knowledgePoints }` |
| 入参 | `text:string` 自然语言描述,可空 |
| 出参 | 结构化出题配置;模块/难度/题量/知识点(知识点=原样收集,可空数组) |
| 异常 | 不抛业务异常;全部非法输入走默认回落,保证永远返回合法配置 |

1.1 `DEFAULT_CONFIG = Object.freeze({...})`(:10):黑龙江省考 / 行测 / 资料分析 / 中等 / 3 题 — 作为一切回落基准。

1.2 解析顺序(优先级:显式 > 关键词 > 默认):

| 项 | 逻辑 | 行号 |
|---|---|---|
| 模块白名单 | `module/_pick`;别名归一(资分→资料分析、判断推理→判断推理等);未命中→DEFAULT.module | :86-90/:102 |
| 题量 | 仅识别阿拉伯数字;非整数→DEFAULT.count;截断:15→10、0→1、无→3 | :103 |
| 难度 | 关键词匹配,未命中→DEFAULT.difficulty | — |
| 局限 | 不识别中文数量词(「一道」→回落 3,已知限制,见 RTM) | — |

1.3 追溯需求:F-001(自然语言入口)、F-002(统一结构化输出)、P-001(30s 内响应含解析耗时)。

## 2. 服务层校验服务  `server/src/services/validateQuestions.js`

| 项 | 内容 |
|---|---|
| 导出 | `validateRaw / validateQuestions / repairQuestion / checkConsistency` |
| 入参 | 题组对象(question/options/answer/analysis...) |
| 出参 | `{ ok, errors[], warnings[], repaired?, data? }` |
| 异常 | 不抛异常,错误以数组返回 |

2.1 四层校验链(F-003/F-004):

| 层 | 校验项 | 行号 |
|---|---|---|
| ① | 题目/选项/答案/解析字段存在性与非空 | — |
| ② | 选项数量(4 个)与结构 | — |
| ③ | 答案落于选项范围内且与选项内容一致(`repair` 归一空白,如 `' c '`→`'C'`) | — |
| ④ | `checkConsistency`(导出于 :76,由 ④ 在 :51-54 调用)内部一致性 | :51-54/:76 |

2.2 checkConsistency 三条规则:

| 规则 | 结果 |
|---|---|
| 选项完全重复 | error → ok=false |
| 解析-答案冲突(解析指向≠答案) | error → ok=false |
| 互为超长子串 | warning(不阻断) |

2.3 追溯需求:F-003(四层校验)、F-004(答案隐藏渲染的数据正确性前提)。

## 3. 服务层数据服务  `server/src/services/mockData.js`

| 项 | 内容 |
|---|---|
| 导出 | `getMockQuestions(module, count)`、`MOCK_MODULES`、`DIFFICULTIES`、`mockQuestions` |
| 入参 | module:白名单模块;count:1~10 已截断 |
| 出参 | 结构化题组数组(Mock 双轨兜底,C4 约束) |
| 备注 | 题库 29 题,id 前缀 `mock_<module>_<n>`;含「增长率」等考纲知识点题(B2 修复后) |

3.1 追溯需求:F-008 双轨数据源(B1)、C4(Mock 双轨)。

## 4. 服务层提示词服务  `server/src/services/buildPrompt.js`

| 项 | 内容 |
|---|---|
| 导出 | `buildPrompt(cfg, ctx?) -> { system, user, temperature? }` |
| 入参 | 结构化出题配置 + 上下文(排除题集、风格延续) |
| 出参 | 可提交 LLM 的 prompt 对象 |
| 组成 | 七步 system(角色/任务/格式/字段/约束/风格/校验要求)+ user(模块/题量/难度/知识点)+ context(追加"风格延续/不重复") |
| 常量 | MODULE_KNOWLEDGE 模块知识点映射 |

4.1 追溯需求:F-001、F-002、C3(统一 Schema)、C5(不编造)。

## 5. 服务层 LLM 服务  `server/src/services/callLLM.js`

| 项 | 内容 |
|---|---|
| 导出 | `callLLM({ system, user, ... }) -> { content, ... }` |
| 入参 | prompt 对象;运行时读取 `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL` |
| 出参 | LLM 响应原文(JSON 文本,由调用方解析) |
| 异常策略 | 无 Key→调用方走 Mock 兜底;超时 30s(AbortController);重试上限 2;错误分类 NETWORK/TIMEOUT/API |

5.1 追溯需求:F-008、P-001(30s 超时/重试 2)、C1(Key 不落地前端)。

## 6. 路由层出题路由  `server/src/routes/generate.js`

| 项 | 内容 |
|---|---|
| 路由 | `POST /api/generate` |
| 内部函数 | `_validateExplicitOverrides(body)`(:33,调用于 :100) |
| 行为 | 显式非法 module/count→400 `{error:{code,message}}`;B2 排除集硬去重(:142-154,空集回退保契约,console.warn :151);同请求两次 id 不同(非幂等) |
| 出参 | 统一 GenerateResponse(见 DATA_SCHEMA) |

6.1 追溯需求:F-001~F-006、F-008、I-01、400 码(ILLEGAL_MODULE/ILLEGAL_DIFFICULTY/ILLEGAL_COUNT)。

## 7. 路由层解析路由  `server/src/routes/explain.js`

7.1 已就绪未接线(B3 已知限制,⛔ 前端入口未开放)。

## 8. 前端模块  `web/src/`

### 8.1 主视图 `web/src/App.vue`(F-001 双入口)

| 项 | 内容 |
|---|---|
| 事件绑定 | 6 处 @click/@submit/@change(表单提交、参数变更、作答、再来一道等) |
| 原子性约束 | 每个按钮/功能区必须有真实行为,否则不渲染(Apple 风格最小可用) |
| 防连点 | 请求期间按钮禁用(R3/BUG-004 修复) |

### 8.2 组件 `web/src/components/`

| 组件 | 职责 | 追溯 |
|---|---|---|
| ConfigForm.vue | 可视化出题参数配置(F-001 表单入口) | F-001 |
| QuestionCard.vue | 题干/选项渲染、答案隐藏渲染、作答交互 | F-004/F-005 |
| ResultPanel.vue | 判题结果、解析、统计展示 | F-006/F-007 |

### 8.3 API 客户端 `web/src/api/client.js`

| 项 | 内容 |
|---|---|
| 导出 | `generate(payload)`、`health()` |
| 行为 | postJSON 封装;非统一错误体→503 归一(R4/BUG-005 修复) |

### 8.4 统计服务 `web/src/stats.js`

| 项 | 内容 |
|---|---|
| 常量 | `STATS_KEY = 'hlj-kaoqa-stats'` |
| 记录结构 | `[{ module, knowledgePoint, correct:0|1, total:1, ts }]` |
| 导出 | `loadStats / appendStats / computeStats` |
| computeStats | 返回 `{ answeredTotal, correctTotal, accuracy(1位小数), weakPoints(≤2个,样本<3 标 insufficient) }` |
| 降级 | localStorage 不可用→内存中静默降级,不报错 |

8.5 追溯需求:F-007(学习统计)、F-002(结构化展示)。

## 9. 函数签名登记表(供 UTP 用例定位)

| 签名 | 文件 | 分组 |
|---|---|---|
| parseRequirement(text) | parseRequirement.js | PARSER |
| validateRaw(raw) / validateQuestions(list) / repairQuestion(q) / checkConsistency(list) | validateQuestions.js | VALIDATE×4 层 |
| checkConsistency(题组) | validateQuestions.js:76 | CONSISTENCY |
| getMockQuestions(module, count) | mockData.js | MOCK |
| buildPrompt(cfg, ctx?) | buildPrompt.js | PROMPT |
| callLLM(promptObj) | callLLM.js | LLM(未 Mock 实测) |
| POST /api/generate | generate.js | API(e2e) |
| GET /api/health | health.js | API(e2e) |

## 10. 与设计的偏离说明

10.1 explain 路由已存在但未在前端开放入口(B3,⛔)。

10.2 LLM 真实链路因无 Key 未实测,以 Mock 双轨保证功能完整(验证口径见 UTR/TSR 遗留风险)。