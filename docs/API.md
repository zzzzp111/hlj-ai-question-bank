# API.md — 接口文档

> **文档定位**：本 Demo 后端全部 HTTP 接口的权威定义（`AGENTS.md §3` 目录约定中的 `docs/API.md`）。
> 请求体 / 响应体结构与 `docs/DATA_SCHEMA.md` 严格一致；接口语义以本文 + `docs/DATA_SCHEMA.md` 为准。
> 所有示例均**可直接复制用于 curl 联调**（服务按 `server/` 启动流程运行后，Base URL 即 `http://localhost:3001`）。

---

## 1. 基础信息

| 项 | 值 |
|----|----|
| Base URL（本地开发） | `http://localhost:3001`（`PORT` 默认 3001，见 `server/.env.example`） |
| 协议 | HTTP；请求/响应均 `Content-Type: application/json`（除 `GET /api/health` 无请求体） |
| 字符集 | UTF-8 |
| 前端代理 | 开发环境前端 `5173` 将 `/api` 代理至 `3001`（`web/vite.config.js`），前端组件一律经 `web/src/api/client.js` 访问，禁止拼 URL |
| 模型调用 | 仅存在于后端 `server/src/services/callLLM.js` 统一封装（C4 双轨，见 §5）；**Wave 9 function calling**：调用携带工具 `search_question_bank`（题库检索，见 §4.3），对 HTTP 调用方透明 |
| 超时 | 后端 LLM 调用 30s 超时、失败重试 1 次；前端请求默认超时 30s |

## 2. 通用约定与错误处理

- 成功：2xx，响应体为约定 JSON 结构。
- 失败：非 2xx，响应体统一为 `{ "error": { "code", "message" } }`（权威定义见 `docs/DATA_SCHEMA.md §5`）。
- 模型异常（408/503）默认回退 **Mock 兜底**：返回 `200` 且 `mock: true`，保证闭环永远可演示（C4）。
- 空请求体 / 缺省字段不是错误：后端按默认值（黑龙江省考 / 行测 / 资料分析 / 中等 / 3 道）处理。

### 错误码总表

| code | 名称 | 触发场景 | 与 Wave 4 回归项对应 |
|------|------|----------|----------------------|
| `400` | 参数错误 | 请求 JSON 非法、`module` 不在白名单、`count` ∉ [1,10]、`difficulty` 非枚举值 | ② 精确输入校验兜底、坏体输入不白屏 |
| `408` | 模型超时 | LLM 调用超时（30s）且重试仍失败、兜底路径不可用 | ⑤ 模型/接口异常 → 错误提示 + 重试按钮 |
| `500` | 未知异常 | 未归类服务端异常 | ⑨ 稳定性回归 |
| `503` | 模型不可用 | 已配置 Key 但模型服务不可达/拒绝，且 Mock 兜底不可用 | ⑤ 断网/后端停 → 错误提示 + 重试按钮（前端网络层归一并展示） |

---

## 3. GET /api/health — 存活探测

### 3.1 定义

| 项 | 值 |
|----|----|
| 方法 | `GET` |
| 路径 | `/api/health` |
| 请求参数 | 无（无请求体） |

### 3.2 成功响应（200）

```json
{ "ok": true }
```

### 3.3 curl 联调

```bash
curl -s http://localhost:3001/api/health
# 期望输出：{"ok":true}
```

---

## 4. POST /api/generate — 核心出题

### 4.1 定义

| 项 | 值 |
|----|----|
| 方法 | `POST` |
| 路径 | `/api/generate` |
| 请求体 | `GenerateRequest`（`docs/DATA_SCHEMA.md §2`，全部字段可选） |

请求体字段速览（详见 `docs/DATA_SCHEMA.md §2.1`）：

```text
{
  requirement?: string        // 自然语言需求
  exam?: string               // 默认 "黑龙江省考"
  subject?: string            // 默认 "行测"
  module?: string             // 白名单：言语理解与表达/判断推理/数量关系/资料分析/常识判断
  difficulty?: string         // 简单 | 中等 | 困难
  count?: number              // 1 ~ 10
  context?: {                 // "再来一道类似"（B2）
    knowledgePoint?: string
    difficulty?: string
    excludedIds?: string[]
  }
}
```

### 4.2 请求示例

**示例 1：纯自然语言（推荐演示路径）**

```json
{
  "requirement": "我黑龙江省考资料分析比较差，给我出3道中等难度的增长率题"
}
```

**示例 2：全显式表单**

```json
{
  "exam": "黑龙江省考",
  "subject": "行测",
  "module": "判断推理",
  "difficulty": "困难",
  "count": 5
}
```

**示例 3：带 context（"再来一道类似"，加分类 B2）**

```json
{
  "module": "资料分析",
  "difficulty": "中等",
  "count": 1,
  "context": {
    "knowledgePoint": "增长率",
    "difficulty": "中等",
    "excludedIds": ["q_1", "q_2"]
  }
}
```

### 4.3 成功响应（200）

**示例 A：真实模型生成（`mock: false`）**

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

**示例 B：Mock 兜底（`mock: true`，无 Key / 模型异常 / 校验失败时）**

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

> **判题注意**：`answer` 仅用于后端校验与判题，**前端渲染层（提交作答前）不得展示**（C2，见 `docs/DATA_SCHEMA.md §4.3`）；提交判题后 `analysis` 方随结果面板展示。

### 4.4 错误响应

**400 参数错误**（如 `count` 超出范围）：

```json
{
  "error": {
    "code": 400,
    "message": "参数错误：count 必须为 1~10 的整数"
  }
}
```

**408 模型超时**（兜底路径亦不可用等极端场景）：

```json
{
  "error": {
    "code": 408,
    "message": "模型响应超时，请稍后重试"
  }
}
```

**500 未知异常**：

```json
{ "error": { "code": 500, "message": "服务异常，请稍后重试" } }
```

**503 模型不可用**：

```json
{ "error": { "code": 503, "message": "模型服务暂不可用" } }
```

### 4.5 curl 联调

```bash
# ① 空体 → 默认值出题（无 Key 环境必然 mock:true）
curl -s -X POST http://localhost:3001/api/generate \
  -H 'content-type: application/json' -d '{}'

# ② 纯自然语言
curl -s -X POST http://localhost:3001/api/generate \
  -H 'content-type: application/json' \
  -d '{"requirement":"我黑龙江省考资料分析比较差，给我出3道中等难度的增长率题"}'

# ③ 全显式表单
curl -s -X POST http://localhost:3001/api/generate \
  -H 'content-type: application/json' \
  -d '{"exam":"黑龙江省考","subject":"行测","module":"判断推理","difficulty":"困难","count":5}'

# ④ 带 context（B2"再来一道类似"）
curl -s -X POST http://localhost:3001/api/generate \
  -H 'content-type: application/json' \
  -d '{"module":"资料分析","difficulty":"中等","count":1,"context":{"knowledgePoint":"增长率","difficulty":"中等","excludedIds":["q_1","q_2"]}}'

# ⑤ 非法参数 → 400
curl -s -X POST http://localhost:3001/api/generate \
  -H 'content-type: application/json' \
  -d '{"module":"不存在的模块","count":99}'
```

---

## 5. POST /api/explain — 追问讲解（加分类 B3）

### 5.1 定义

| 项 | 值 |
|----|----|
| 方法 | `POST` |
| 路径 | `/api/explain` |
| 请求体 | `{ question, analysis, userAsk }` |
| 响应 | `{ explanation }` |

功能：用户提交后对某题点"没看懂，再讲一遍"，后端基于该题题干与解析生成更通俗的大白话讲解（无 Key 时用模板基于 `question`/`analysis` 重述，有 Key 时走 LLM）。

### 5.2 请求示例

```json
{
  "question": "2023 年某省粮食产量为 3200 万吨，2024 年增长 5%，则 2024 年粮食产量为多少万吨？",
  "analysis": "现期量 = 基期量 × (1 + 增长率) = 3200 × 1.05 = 3360 万吨。",
  "userAsk": "为什么是乘 1.05 而不是乘 5？"
}
```

### 5.3 成功响应（200）

```json
{
  "explanation": "这里“增长 5%”指的是在原来的基础上增加百分之五。原来产量是 3200 万吨，增加 5% 就是 3200 的 5%，也就是 160 万吨，所以新产量 = 3200 + 160 = 3360 万吨。把它写成公式就是“现期量 = 基期量 ×（1 + 增长率）”，1 代表原本的 100%，加上 5% 就是 105%，所以乘 1.05。"
}
```

### 5.4 curl 联调

```bash
curl -s -X POST http://localhost:3001/api/explain \
  -H 'content-type: application/json' \
  -d '{"question":"2023 年某省粮食产量为 3200 万吨，2024 年增长 5%，则 2024 年粮食产量为多少万吨？","analysis":"现期量 = 基期量 × (1 + 增长率) = 3200 × 1.05 = 3360 万吨。","userAsk":"为什么是乘 1.05 而不是乘 5？"}'
```

---

## 6. 与 Wave 4 回归清单（`docs/CLUSTERS.md` C4.1）的对应

| 回归项 | 涉及接口/行为 | 期望结果 | 本文依据 |
|--------|--------------|----------|----------|
| ① 正常配置闭环 | `POST /api/generate` + 前端表单 | 200，合法 GenerateResponse，`questions` 完整 | §4.3 示例 A/B |
| ② 自然语言闭环 / 精确输入 | `POST /api/generate` with `requirement` | 200，参数被正确解析（module/difficulty/count 命中） | §4.2 示例 1、§4.4 400 |
| ③ 无 Key（Mock） | `POST /api/generate`（无 Key 环境） | `mock: true`，界面 Mock 徽标可见 | §4.3 示例 B |
| ④ DOM 答案不可见 | 前端渲染 + `POST /api/generate` | 提交前 DOM 无 answer/analysis 文本 | `docs/DATA_SCHEMA.md §4.3`（C2） |
| ⑤ 断网/后端停、模型异常 | 前端网络层 + 错误码 | 统一 `{error:{code,message}}` + 重试按钮，不白屏 | §2 错误码表（408/503/400） |
| ⑦ 坏题容错 | `validateQuestions` 失败 → 重试 ≤2 → Mock | 200 + `mock: true`，前端不崩 | §4.3 示例 B、`docs/DATA_SCHEMA.md §4.2` |

> 表中未列出的回归项（⑥ 连点防重、⑧ build/verify 全绿、⑨ 从零复现）为工程/验证侧行为，不涉及接口契约变更。

---

## 7. 关联文档

- `docs/DATA_SCHEMA.md` — 数据结构权威定义（GenerateRequest / GenerateResponse / Question / 错误响应）
- `docs/ARCHITECTURE.md` — 分层架构与数据流（Wave 0 C0.1 产出）
- `docs/CLUSTERS.md` — 波次编排与原子提示词（Wave 4 回归清单）
- `AGENTS.md` — 全局强制约束（C1~C6 硬性项）