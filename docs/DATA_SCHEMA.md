# DATA_SCHEMA.md — 统一数据结构（Schema 权威定义）

> **文档定位**：本项目前后端全部数据交互的唯一结构化契约（对应 `AGENTS.md` 硬性约束 **C3 统一 Schema**）。
> 任何接口的请求体 / 响应体必须符合本文定义；严禁返回整段 Markdown 文本由前端直接展示。
> 本文为**权威定义**：接口行为以本文为准，实现代码（`server/src/services/*`、`web/src/**`）不得偏离本文语义。
> 关联文档：`docs/API.md`（接口层）、`docs/ARCHITECTURE.md`（系统架构）。

---

## 1. 全局约定

| 项 | 约定 |
|----|------|
| 编码 | 全部为 UTF-8 编码的 JSON（`Content-Type: application/json`） |
| 字段命名 | `camelCase`；命名即语义，禁止同义字段并存 |
| 枚举取值 | 中文原样传递，前后端不做大小写/简繁转换 |
| 未知字段 | 接收方忽略未知字段，不报错（向前兼容） |
| 可选字段 | 用 `?` 标注，缺省时由后端按默认值补齐（见 §3.3） |
| 数值类型 | `count` 为整数（JSON number），其余字符串 |
| 必填口径 | **响应字段只要出现在 Schema 中即为必填**（模型/Mock 兜底都必须给出），请求字段按 §3.1 标注 |

---

## 2. GenerateRequest（`POST /api/generate` 请求体）

### 2.1 字段总览

| 字段 | 类型 | 必填 | 取值枚举 | 说明 |
|------|------|------|----------|------|
| `requirement` | string | 否 | 任意自然语言 | 用户的练习需求描述（NL），由后端 `parseRequirement` 解析出结构化参数 |
| `exam` | string | 否 | `黑龙江省考`（当前唯一） | 考试地区；Demo 限定黑龙江省，字段保留以备扩展 |
| `subject` | string | 否 | `行测`（当前唯一） | 考试科目；Demo 限定行测 |
| `module` | string | 否 | 见 §2.2 白名单 | 练习模块（题型大类） |
| `difficulty` | string | 否 | `简单` / `中等` / `困难` | 目标难度 |
| `count` | number | 否 | 整数 1 ~ 10 | 本次出题数量，越界视为 400 |
| `context` | object | 否 | 见 §2.3 | 二次出题上下文（加分类 B2"再来一道类似"），存在时后端必须透传并延续风格 |

> 全部为可选：空体 `{}` 不视为错误，按默认值走完整流程（见 §2.4）。表单显式字段**优先于** `requirement` 解析结果（开发流程文档 §3.5 ①："显式表单字段覆盖 NL 结果"）。

### 2.2 `module` 白名单（五大模块）

| module 值 | 知识点范围示例 |
|-----------|----------------|
| `言语理解与表达` | 主旨概括、意图判断、逻辑填空、语句排序 |
| `判断推理` | 定义判断、类比推理、逻辑判断 |
| `数量关系` | 工程问题、行程问题、排列组合、数列与计算 |
| `资料分析` | 基期/现期、同比/环比、增长率、比重、平均数、倍数 |
| `常识判断` | 通用常识（禁编造黑龙江具体政策，见 C5） |

白名单之外的 `module` 值 → 400 参数错误（除非能被 `requirement` 解析命中白名单并通过表单校验）。

> **Wave 9 修订**：知识点范围不再写死在提示词（原 `buildPrompt` 的 `MODULE_KNOWLEDGE` 表已移除），
> 由 function calling 工具 `search_question_bank`（见 §6）动态检索题库素材决定；上表仅为模块语义示例，非代码内嵌数据。

### 2.3 `context` 对象（"再来一道类似"）

用途：加分类 B2。用户在已作答一组后点"再来一道"，前端将上次题目的知识点 / 难度 / 已出题 id 带回，后端透传并入提示词（"保持与上题同知识点同难度、命题不重复"），生成后对 `excludedIds` 做去重过滤。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `knowledgePoint` | string | 否 | 延续的知识点，如 `增长率`；缺省则按 `difficulty` 抽题 |
| `difficulty` | string | 否 | 延续的难度，枚举同 §2.1；缺省沿用本次默认难度 |
| `excludedIds` | array\<string\> | 否 | 本次会话已出题目的 `id` 列表，用于提示与校验层去重，避免重复命制同题 |

`context` 示例：

```json
{
  "module": "资料分析",
  "count": 1,
  "context": {
    "knowledgePoint": "增长率",
    "difficulty": "中等",
    "excludedIds": ["q_1", "q_2"]
  }
}
```

### 2.4 缺省与默认值

后端 `parseRequirement` 在"NL 未命中 + 表单未显式指定"时采用以下默认值，保证**任何输入都可演示闭环**（对应 `AGENTS.md` 验收："无 Key、超时、调用异常时必须回退 Mock，保证闭环永远可演示"）：

| 字段 | 默认值 |
|------|--------|
| `exam` | `黑龙江省考` |
| `subject` | `行测` |
| `module` | `资料分析` |
| `difficulty` | `中等` |
| `count` | `3` |
| `context` | `null`（无） |

### 2.5 完整示例

```json
{
  "requirement": "我黑龙江省考资料分析比较差，给我出3道中等难度的增长率题",
  "exam": "黑龙江省考",
  "subject": "行测",
  "module": "资料分析",
  "difficulty": "中等",
  "count": 3
}
```

---

## 3. GenerateResponse（`POST /api/generate` 响应体）

### 3.1 字段总览

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mock` | boolean | 是 | `true` = 本次为内置 Mock 题库兜底；`false` = 真实模型（LLM）生成 |
| `exam` | string | 是 | 同请求归一化结果，如 `黑龙江省考` |
| `subject` | string | 是 | 如 `行测` |
| `module` | string | 是 | 白名单内模块，如 `资料分析` |
| `difficulty` | string | 是 | 枚举同请求，如 `中等` |
| `questions` | array\<Question\> | 是 | 题目数组，**非空**（长度 = 请求 `count`），元素见 §4 |
| `mockReason` | string | 否 | **仅当 `mock: true` 时可选附带**：Mock 兜底原因（`NO_KEY`/`TIMEOUT`/`VALIDATION_FAILED`/`EMPTY_CONTENT`/`HTTP`），供前端徽标提示与排查降级原因；`mock:false` 时不存在（可选诊断字段，不破坏既有契约，向前兼容） |

> `mock` 双轨语义（对应 **C4 Mock 双轨**）：真实链路为 `callLLM → validateQuestions（失败重试 ≤2 次）`，任一环节异常或校验最终失败，统一回退 `mockData` 并置 `mock: true`；响应**永远**是合法 GenerateResponse，前端不得因字段缺失白屏。

### 3.2 完整示例

`mock: false`（真实模型生成）：

```json
{
  "mock": false,
  "exam": "黑龙江省考",
  "subject": "行测",
  "module": "资料分析",
  "difficulty": "中等",
  "questions": [
    {
      "id": "q_1",
      "question": "2023 年某省粮食产量为 3200 万吨，2024 年增长 5%，则 2024 年粮食产量为多少万吨？",
      "options": { "A": "3200", "B": "3360", "C": "3400", "D": "3520" },
      "answer": "B",
      "analysis": "现期量 = 基期量 × (1 + 增长率) = 3200 × 1.05 = 3360 万吨，故选 B。",
      "knowledgePoint": "增长率"
    }
  ]
}
```

`mock: true`（无 Key / 模型异常 / 校验失败兜底）：

```json
{
  "mock": true,
  "exam": "黑龙江省考",
  "subject": "行测",
  "module": "资料分析",
  "difficulty": "中等",
  "questions": [
    {
      "id": "m_1",
      "question": "2023 年某市社会消费品零售总额为 4800 亿元，比上年增长 6%，则增长量为多少亿元？",
      "options": { "A": "260", "B": "272", "C": "288", "D": "300" },
      "answer": "B",
      "analysis": "增长量 = 现期量 / (1 + 增长率) × 增长率 ≈ 4800 / 1.06 × 0.06 ≈ 272 亿元，故选 B。",
      "knowledgePoint": "增长率"
    }
  ]
}
```

> 注：文档中 Mock 示例的 `id` 以 `m_` 前缀区分真实链路（`q_`），仅为区分易读；`id` 唯一性由后端生成保证。真实 Mock 题库见 `server/src/services/mockData.js`，各题答案与解析逐题自洽（该校验由 `validateQuestions.js` 一致性层保证）。

---

## 4. Question（题目对象）

### 4.1 字段总览

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 题目唯一标识，由后端生成（如 `q_1`、`m_1`），供前端渲染 `key` 与判题定位使用；同一响应内必须唯一 |
| `question` | string | 是 | 完整题干，**非空** |
| `options` | object | 是 | 选择题选项映射，**恰为 A/B/C/D 四个键**，值为非空字符串 |
| `answer` | string | 是 | 正确答案标识，必须 ∈ `{A,B,C,D}`，且与 `options` 键一致（见 §4.3） |
| `analysis` | string | 是 | 本题解析（含答案推导、关键公式与知识点回顾），**非空** |
| `knowledgePoint` | string | 推荐 | 知识点标签（如 `增长率`）；可缺省但**应存在**，用于薄弱知识点统计（B4）与二次出题（B2） |

### 4.2 校验规则（对应 `server/src/services/validateQuestions.js` 四层校验）

1. **JSON 层**：剥取响应中首个 JSON 块（兼容 ` ```json ` 围栏）并 `JSON.parse`；失败 → 触发重生成（≤2 次）→ 仍失败 Mock 兜底。
2. **结构层**：存在 `exam / subject / module / difficulty / questions` 且 `questions` 为非空数组；数组长度与请求 `count` 一致。
3. **逐题字段层**：
   - `question` 非空；
   - `options` 恰为 A/B/C/D 四键，且四值均非空；
   - `answer` ∈ `{A,B,C,D}` **且与 `options` 键一致**（即该键必然存在）；
   - `analysis` 非空；
   - `knowledgePoint` 可缺省，但缺省时应回填合理默认知识点或标记未知。
4. **一致性层**：`answer` 指向的选项文本非空；题干、选项、答案、解析之间不得明显矛盾（对含数字类题干做基本核对；深度语义核对属 B1 强化范围）。

**轻微修复**：仅限无歧义的清洗（如 `answer: "C "` → `"C"`、字段首尾空白清理）；修复后重新校验，仍不过则该题判坏题进入重生成，最终失败整组 Mock 兜底（`mock: true`）。

### 4.3 C2 答案隐藏约定（前端渲染层硬性约束）

> 对应 `AGENTS.md` **C2 答案隐藏**：

- `answer` 字段**仅用于后端校验与判题**：随后端响应下发时仅存在于内存对象中，**前端渲染层（用户提交作答前）不得展示**，不得渲染进 DOM（含 `textContent`、`title`、`data-*`、aria 标签等任何形态）。
- 前端 `QuestionCard` 组件 **props 只接收** `{ id, question, options, knowledgePoint }`；`answer`、`analysis` 严禁传入题卡组件。
- `analysis` 同理：**用户提交本组作答、判题完成后**才随结果面板展示。
- 判题：用户提交后，由 `App.vue` 持有的完整数据与用户答案比对，仅当次展示正确答案与解析。

---

## 5. ExplainRequest / ExplainResponse（`POST /api/explain` 追问讲解）

> 加分项 B3。已提交判题后，用户可就单题请求"通俗讲解"（`web/src/components/ResultPanel.vue` 追问讲解按钮）。辅助能力，**不做 Mock 兜底**：有 Key 走 `callLLM` 生成大白话讲解；无 Key 走本地模板把解析重述为口语化讲解；异常统一 503。

### 5.1 ExplainRequest（请求体）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | 否 | 该题完整题干（空串也可，模板会兜底） |
| `analysis` | string | 否 | 该题官方解析文本 |
| `userAsk` | string | 否 | 用户的针对性疑问（如"为什么不能用基期公式"）；可缺省 |

### 5.2 ExplainResponse（响应体）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `explanation` | string | 是 | 通俗讲解文本（UTF-8，可含换行） |

成功示例：

```json
{ "explanation": "先回答你的疑问：「为什么不能用基期公式」。\n用大白话一步一步来看：\n1. ……" }
```

失败（与 §6 统一错误结构一致）：

```json
{ "error": { "code": 503, "message": "讲解服务暂不可用" } }
```

---

## 6. 统一错误响应

### 6.1 结构

所有非 2xx 响应统一为：

```json
{
  "error": {
    "code": 400,
    "message": "参数错误：module 不在白名单内"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `error` | object | 是 | 错误对象 |
| `error.code` | number | 是 | 错误码，**与 HTTP 状态码同值**，便于前端/日志直接映射 |
| `error.message` | string | 是 | 人类可读的中文错误说明，前端可原样展示并附"重试"入口 |

当前端网络层异常（后端不可达、超时抢先）时，`web/src/api/client.js` 将错误归一化为同一 `{ error: { code, message } }` 结构，保证前端错误态统一。

### 6.2 错误码表

| code（HTTP 同值） | 名称 | 触发场景 | message 示例 | 对应 Wave 4 回归项 |
|----|------|----------|--------------|--------------------|
| `400` | 参数错误 | 请求 JSON 非法、`module` 不在白名单、`count` 超出 1~10、`difficulty` 非枚举值 | `参数错误：count 必须为 1~10 的整数` | ② 精确输入（表单校验兜底）；坏体不白屏 |
| `408` | 模型超时 | LLM 调用超过超时阈值（30s），重试仍超时 | `模型响应超时，请稍后重试` | ⑤ 异常场景不白屏 + 重试按钮 |
| `500` | 未知异常 | 未归类服务端异常（兜底路径本身失败） | `服务异常，请稍后重试` | ⑨ 稳定性回归 |
| `503` | 模型不可用 | 已配置 Key 但模型服务不可达/拒绝（网络、鉴权、5xx），且 Mock 兜底不可用 | `模型服务暂不可用` | ⑤ 模型/接口异常有基本处理 |

> 语义说明：本 Demo 遵循 C4"闭环永远可演示"——**模型异常（408/503 场景）默认被捕获并回退 Mock，此时接口返回 `200` + `mock: true`**；错误码 `408`/`503` 仅用于兜底路径本身也失败的极端情况（如 Mock 数据缺失、服务内部崩溃），确保错误结构与前端错误态契约始终成立。空体 `{}` / 缺省字段**不触发** 400，按 §2.4 默认值处理。

---

## 7. 变更管理

- 本文为 Schema 权威定义；**接口或数据结构一旦变更，必须同步更新 `docs/API.md` 等关联文档，再继续开发**（`AGENTS.md §6`）。
- 新增题型 / 新字段：优先在现有对象内扩展可选字段；删除或重命名已有字段必须走变更记录并同步后端校验（`validateQuestions.js`）与前端渲染（`QuestionCard.vue`）。
- `answer` 的"后端校验 + 判题专用、前端提交前不渲染"语义为**不可变更项**（C2 硬性约束）。

---

## 8. Function Calling 工具：search_question_bank（Wave 9）

模型调用（`callLLM`）携带 OpenAI 兼容 `tools` 声明；模型可先调用本工具检索题库素材，再基于素材命制原创改编题。**对 HTTP 调用方完全透明**：`POST /api/generate` 的请求/响应 Schema（§2/§3）不变。

### 8.1 工具定义（服务端内置）

| 项 | 值 |
|----|----|
| 工具名 | `search_question_bank` |
| 必填参数 | `module`（白名单五模块，enum 约束） |
| 可选参数 | `difficulty`（简单/中等/困难）、`topic`（知识点/主题关键词，题干+知识点+解析模糊匹配）、`limit`（1~10，缺省 5） |

### 8.2 返回结构（role:'tool' 消息内容，JSON）

```json
{
  "ok": true,
  "source": "local",
  "total": 3,
  "items": [
    {
      "id": "mock_资料分析_1",
      "module": "资料分析",
      "difficulty": "简单",
      "question": "题干……",
      "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
      "answer": "B",
      "analysis": "解析……",
      "knowledgePoint": "增长率"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ok` | boolean | 是否检索成功（模块非法时 `false` + `error`） |
| `source` | `local` / `remote` | 数据来源：`remote`=QUESTION_BANK_API_URL 联网检索；`local`=内置种子题库兜底 |
| `items[]` | 素材数组 | 与 Question 同构，但含 `module`/`difficulty` 元数据（仅服务端给 LLM 参考，不下发前端） |

### 8.3 数据源与回退

- 配置 `QUESTION_BANK_API_URL` 时优先联网检索：`GET {url}?module=&difficulty=&topic=&limit=`，响应 `{ items: [...] }` 或 `[...]`；5s 超时，任何异常/结果为空静默回退本地。
- 未配置/回退：本地种子（`mockData` 的 `mockBank` 元数据），无网无 Key 可演示。
- 命制约束：prompt 要求基于素材命制原创改编题、知识点以检索结果为准、严禁编造（C5）。