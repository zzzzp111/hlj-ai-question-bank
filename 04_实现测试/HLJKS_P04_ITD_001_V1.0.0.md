# 集成测试说明 (ITD)

- **文档标识号**:HLJKS-ITD-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22
- **执行命令**:`cd server && npm run test:e2e`(test/e2e.mjs,自启服务 PORT=3199)

---

## 1. 测试目标

1.1 验证服务端路由与各服务层模块的集成契约(HTTP 层 + 数据层 + 解析/校验链)。

1.2 验证 I-01/I-02 接口行为:I-03(explain)未接线,仅列状态不做用例。

## 2. 环境

| 项 | 值 |
|---|---|
| 端口 | 3199(e2e 自启,不占用开发端口 3001) |
| 断言方式 | node:test 断言,结果 8/8 PASS |
| 数据源 | Mock 双轨(无 LLM Key 环境) |

## 3. 集成用例清单(8 组)

| # | 用例(e2e.mjs 行号) | 请求 | 预期 | 追溯 |
|---|---|---|---|---|
| 1 | :71 | GET /api/health | 200,status=ok | I-01 |
| 2 | :77 | POST /api/generate `{ requirement:"来 1 道资料分析题,关于增长率的" }` | 200;mock=true;questions.length=1;结构化字段完整 | F-001/F-002 |
| 3 | :100 | 用例 2 响应字段完整性 | id/module/difficulty/questions 各字段齐全,answer/analysis 不随题面下发 | F-002/C2/C3 |
| 4 | :122 | POST overrides.module=非法值 | 400 `{error:{code:"ILLEGAL_MODULE"}}` | F-001/I-01 |
| 5 | :136 | POST overrides.count=99 与 "abc" | 400 `ILLEGAL_COUNT` | P-001 |
| 6 | :144 | POST 空 body | 200 默认 3 题(DEFAULT_CONFIG) | F-001 |
| 7 | :158 | context.excludedQuestions 命中目标题 | 排除集命中 0(硬去重生效) | F-008/B2 |
| 8 | :179 | 同请求发出两次 | 两次 id 不同(非幂等) | I-02 |

## 4. 通过标准

4.1 8 组用例全部 PASS,任一失败即整体失败。

4.2 断言覆盖:HTTP 状态码、统一错误体结构、结构化输出字段完整性、排除集命中率、幂等性。

## 5. 执行结果

| 项 | 结果 |
|---|---|
| 通过 | 8/8 PASS |
| 失败 | 0 |
| 结论 | **PASS** |

5.1 最近一次全量执行:Wave 7 代码复核阶段重新执行,结果不变(8/8)。

## 6. 已知限制

6.1 I-03 解析接口:服务端已实现,前端未接线,B3 ⚠️。