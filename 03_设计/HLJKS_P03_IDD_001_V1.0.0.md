# 接口设计说明 (IDD)

- **文档标识号**:HLJKS-IDD-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22
- **前置文档**:HLJKS-P02-IRS-001-V1.0.0、HLJKS-P03-HLD-001-V1.0.0

---

## 1. 接口总览

| 接口号 | 方法 | 路径 | 归属 | 状态 |
|---|---|---|---|---|
| I-01 | GET | /api/health | server(health.js) | ✅ 已实现已测试 |
| I-02 | POST | /api/generate | server(generate.js) | ✅ 已实现已测试 |
| I-03 | POST | /api/explain | server(explain.js) | ⚠️ 已实现未接线(B3) |
| I-04 | — | 前端调用层 | web(api/client.js + App.vue) | ✅ 已实现 |
| I-05 | 内部 | function calling 工具 search_question_bank | server(services/questionBank.js) | ✅ 已实现(Wave 9) |

## 2. I-01 健康检查

| 项 | 内容 |
|---|---|
| 请求 | `GET /api/health` |
| 成功 | `200 { status:"ok", ... }` |
| 约束 | 无鉴权;用于前端启动探活与 e2e 用例 |
| 追溯 | IRS I-01、SRS 非功能 |

## 3. I-02 出题接口  `POST /api/generate`

### 3.1 请求

```json
{
  "requirement": "来 1 道资料分析题,关于增长率的",
  "module": "资料分析",
  "count": 1,
  "context": { "excludedQuestions": ["题干文本1"] }
}
```

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| requirement | string | 否 | 自然语言描述,空串视为默认出题 |
| exam/subject/module/difficulty/count | — | 否 | **顶层显式字段**(Wave 9 修订,与 DATA_SCHEMA §2 逐字段一致):显式提供时优先于 NL 解析;module 白名单枚举、count:1~10 整数、difficulty 难度枚举 |
| context.excludedQuestions | string[] | 否 | 本次已出题的**题干文本**数组,服务端硬去重(空集回退保契约,console.warn;Wave 9 修订:字段名与代码对齐) |

### 3.2 参数校验(显式覆盖 vs 自然语言)

| 来源 | 非法处理 |
|---|---|
| overrides.module 非白名单 | 400 `ILLEGAL_MODULE` |
| overrides.count 非整数/超范围 | 400 `ILLEGAL_COUNT` |
| overrides.difficulty 非法 | 400 `ILLEGAL_DIFFICULTY` |
| requirement 语义不清晰 | 回落 DEFAULT_CONFIG,不报错 |

### 3.3 成功响应  `200`

```json
{
  "mock": true,
  "exam": "黑龙江省考",
  "subject": "行测",
  "module": "资料分析",
  "difficulty": "中等",
  "questions": [
    {
      "id": "q_1",
      "question": "题干……",
      "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
      "answer": "B",
      "analysis": "解析……",
      "knowledgePoint": "增长率"
    }
  ]
}
```

3.3.1 Wave 9 修订:响应结构与 `docs/DATA_SCHEMA.md §3` 逐字段对齐——`mock` 双轨布尔、`id` 每次唯一(`q_<6hex>` 重生成,含 Mock 路径,不再保留 `mock_` 前缀);`answer/analysis` 为后端校验与判题专用,前端渲染层提交前不展示(C2 约束见 `docs/DATA_SCHEMA.md §4.3`)。

### 3.4 错误响应  `{ "error": { "code": 400, "message": "..." } }`（Wave 9 修订：code 与 HTTP 状态同值数字，见 DATA_SCHEMA §5）

| HTTP | code | 场景 |
|---|---|---|
| 400 | 400 | 显式 module 非白名单（顶层字段校验，见 §3.1） |
| 400 | 400 | 显式 count 非 1~10 整数 |
| 400 | 400 | 显式 difficulty 非枚举值 |
| 404 | 404 | 未知路径（全局兜底「接口不存在」） |
| 503 | 503 | 模型不可用且 Mock 兜底路径本身失败；前端网络层异常归一为 503「网络异常…」 |

### 3.5 时序与容错

| 项 | 值 |
|---|---|
| 超时 | 30s(AbortController) |
| 重试 | LLM 层上限 2 次 |
| 幂等性 | 非幂等:同请求两次 id 不同(e2e 用例 8 验证) |

## 4. I-03 解析接口  `POST /api/explain`(B3 ⚠️)

| 项 | 内容 |
|---|---|
| 请求 | `{ questionId }` 或题目完整负载 |
| 响应 | `200 { explanation, ... }` |
| 状态 | 服务端已实现;前端未接线,入口未开放(已知限制,见 RTM B3) |

## 5. I-04 前端调用层契约

| 项 | 内容 |
|---|---|
| 封装 | `web/src/api/client.js` 之 `generate(payload)` / `health()` |
| 错误归一 | postJSON 捕获非 2xx/非 `{error}` 结构 → 统一 503 语义(前端展示友好提示) |
| 与 data 分离 | 前端组件不直接拼 URL,统一走 client.js(AGENTS.md C7) |

## 6. 数据格式与超时汇总(与 IRS 对齐)

6.1 全部 JSON UTF-8;日期时间 ISO8601(仅统计记录 `ts` 字段)。

6.2 超时/重试/错误码与 HLJKS-P02-IRS-001 §5 一致,无偏差。

## 7. 内部工具接口 I-05 search_question_bank（function calling，Wave 9）

LLM 会话内部工具（对 HTTP 调用方透明，不占对外接口号；供 generate 路由 ↔ questionBank 服务使用）。

| 项 | 内容 |
|---|---|
| 触发 | `callLLM` 携带 tools 时，模型返回 tool_calls 由路由执行器 `_toolExecutor` 分发 |
| 请求参数 | module（必填，枚举五模块）/ difficulty（可选，三档）/ topic（可选，关键词）/ limit（可选，1~10，缺省 5） |
| 返回 | `{ ok, source:'local'\|'remote', total, items:[Question素材含 module/difficulty] }` |
| 超时 | 远程检索 5s（AbortController）；本地种子零网络 |
| 回退 | 远程未配置/异常/空结果 → 本地种子（mockBank）；模块非法 → `{ok:false,error}` 回填模型 |
| 上限 | tool_calls 往返 ≤2 轮（MAX_TOOL_ROUNDS），超限且无最终内容 → 归类 HTTP 异常走 Mock 兜底 |
| 追溯 | DATA_SCHEMA §7、ARCHITECTURE §2.1；源码 `services/questionBank.js` |

## 8. LLM 会话内部契约（Wave 9）

| 项 | 内容 |
|---|---|
| 工具轮询 | assistant.tool_calls → 执行器 → role:'tool' 回填 → 再请求；重复至无 tool_calls 或达上限 |
| 执行器 | generate.js `_toolExecutor(name,args)`：仅路由 search_question_bank，未知工具返回 `{ok:false,error}` |
| 错误归类 | NO_KEY / TIMEOUT / HTTP / NETWORK 全部经 callLLM → generate 路由 catch → Mock 兜底（mock:true） |
| 一致性命中 | 与 I-02 参数校验（400）完全解耦：工具参数非法不改 HTTP 状态码 |