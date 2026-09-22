# 接口需求规格说明（IRS）

- **文档标识号**：HLJKS-IRS-001-V1.0
- **状态**：APPROVED → 归属于 V1.0.0 交付基线
- **数据源**：`docs/API.md`（接口字段级说明）、`docs/DATA_SCHEMA.md`（数据字典）、`server/src/routes/*.js`（实现）
- **顶层需求**：SRS F-001/F-002/F-006、P-001；docx §7 结构化输出、§8 异常与稳定性

---

## 1. 接口清单

| 序号 | 方法 | 路径 | 用途 | 状态 |
|---|---|---|---|---|
| I-01 | GET | `/api/health` | 健康检查，返回服务存活与运行模式 | 已实现（e2e 用例 1） |
| I-02 | POST | `/api/generate` | 出题主接口：入参 → GenerateResponse | 已实现（核心） |
| I-03 | GET | `/api/explain` | 题目追问简讲（docx §13.3 加分项 B3） | 后端就绪、前端未接线（已知限制） |
| I-04 | — | 前端 `api/client.js` | 组件禁止拼 URL，统一经 client 调用 | 已实现（前端契约） |

## 2. 通用约定

- 传输：JSON over HTTP/1.1；字符集 UTF-8。
- 无鉴权（Demo 范围，C1 保证 Key 不进前端）。
- **统一错误体**：`{"error": {"code": "<字符串码>", "message": "<人类可读>"}}`；非法显式入参 → HTTP 400（见 §5）。

## 3. 请求协议（I-02 POST /api/generate）

请求体（全字段可选）：

```jsonc
{
  "requirement": "我黑龙江省考资料分析比较差，给我出 3 道中等难度的增长率题", // 自然语言入口
  "overrides": {                       // 表单入口/显式覆盖（优先级高于 NL 识别结果）
    "exam": "黑龙江省考", "subject": "行测", "module": "资料分析",
    "difficulty": "中等", "count": 3, "knowledgePoint": "增长率"
  },
  "context": { "excludedQuestions": ["上一题题干文本…"] } // B2 硬去重
}
```

参数约束（白名单与默认值，实现见 `parseRequirement.js`）：

| 字段 | 取值/范围 | 非法处理 |
|---|---|---|
| exam | 黑龙江（省考） | 回落到 `DEFAULT_CONFIG.exam=黑龙江省考` |
| subject | 行测 | 回落 `DEFAULT_CONFIG.subject=行测` |
| module | 言语理解与表达/判断推理/数量关系/资料分析/常识判断（支持别名：资分/判断推理/言语） | **显式非法值 → 400**（`ILLEGAL_MODULE`）；NL 未命中 → 回落 `资料分析` |
| difficulty | 简单/中等/困难 | **显式非法值 → 400**（`ILLEGAL_DIFFICULTY`） |
| count | 整数 1~10 | **显式越界/非数字 → 400**（`ILLEGAL_COUNT`）；NL 识别 15→10、0→1、未提及→3（中文数量词「一道」→3，已知限制，见 README §9） |
| knowledgePoint | 字符串（如 增长率） | 仅透传不校验 |
| context.excludedQuestions | string[]（题干文本） | 非数组则忽略；过滤后为空回退原题 |

## 4. 响应协议

### 4.1 成功（200）

```jsonc
{
  "mock": true,                          // C4：Mock 双轨标记（真模型时为 false）
  "exam": "黑龙江省考", "subject": "行测", "module": "资料分析", "difficulty": "中等",
  "questions": [
    { "id": "q_xxx", "question": "题干…",
      "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
      "answer": "C", "analysis": "解析…", "knowledgePoint": "增长率" }
  ]
}
```

### 4.2 错误（非 200）

| HTTP | code | 场景 |
|---|---|---|
| 400 | `ILLEGAL_MODULE` / `ILLEGAL_DIFFICULTY` / `ILLEGAL_COUNT` | 显式 overrides 非法（e2e 用例 4/5） |
| 503 | `LLM_UNAVAILABLE` 等 | LLM 连续失败且无 Mock 可兜（前端 `postJSON` 对**非统一错误体**归一为 503） |
| 500 | `INTERNAL` | 未预期异常（兜底） |

## 5. 时序、超时与重试

- `callLLM`：单次超时 **30s**；网络/超时失败重试，重试上限 **2 次**；探测无 Key（`LLM_API_KEY` 未配）→ 直接走 Mock 路由（即时返回，满足 P-001）。
- 幂等性说明：generation 非幂等——每次生成题目 `id` 全局唯一（`q_<hash>`，e2e 用例 8 验证两次请求 id 不同）；客户端不应假定重复请求结果相同。

## 6. 异常处理约定

| 异常 | 处理 |
|---|---|
| 模型返回非法 JSON | `buildPrompt` 约束输出 JSON + 解析失败走 Mock 兜底（docx §8.1） |
| 单题缺选项/答案/解析 | `validateQuestions` 四层校验自动修复（repair）；无法修复则拒收该题 |
| 接口超时/失败 | 前端不白屏：展示错误态与重试按钮（docx §8.3） |
| 用户连点生成 | 前端防连点（R3 已落实，BUG-004 已修复） |
| 非统一错误体 | 前端 `postJSON` 归一为 503 + 友好文案（R4，BUG-005 已修复） |

## 7. 前端接口契约（I-04）

- 组件禁止 `fetch` 拼 URL；统一 `web/src/api/client.js` 暴露 `generate(req)` / `health()`。
- 返回值结构直接送入 QuestionCard；错位/缺失字段由 `validateQuestions` 后端兜底。

## 8. 追溯

- 本条接口逐字段 ↔ `docs/API.md`；数据字典 ↔ `docs/DATA_SCHEMA.md`；测试用例 ↔ `HLJKS_P04_ITD_001`（e2e 8 组）。