# 单元测试报告 (UTR)

- **文档标识号**:HLJKS-UTR-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22

---

## 1. 执行摘要

| 项 | 结果 |
|---|---|
| 执行命令 | `cd server && npm run verify`(scripts/verify-services.js) |
| 总断言数 | 32 |
| 通过 | 32 |
| 失败 | 0 |
| 结论 | **PASS(全部通过)** |

## 2. 分组执行结果

| 分组 | 覆盖函数 | 断言数 | 通过 | 失败 |
|---|---|---|---|---|
| PARSER | parseRequirement | 8 | 8 | 0 |
| VALIDATE | validateRaw / validateQuestions / repairQuestion(四层) | 8 | 8 | 0 |
| CONSISTENCY | checkConsistency | 5 | 5 | 0 |
| MOCK | getMockQuestions / MOCK_MODULES / DIFFICULTIES | 6 | 6 | 0 |
| PROMPT | buildPrompt | 5 | 5 | 0 |
| **合计** | — | **32** | **32** | **0** |

3.1 断言计数口径:verify-services.js 中 `ok(` 断言调用数按分组统计(8+8+5+6+5=32)。

## 3. 偏差说明

| 项 | 说明 |
|---|---|
| 语句覆盖率 | 本计划范围内函数:以断言全过为准,未单独度量行覆盖率 |
| 未覆盖项 | callLLM 真实 LLM 网络路径(无 Key,未实测,由路由 Mock 兜底) |

## 4. 结论

4.1 服务层五个功能分组全部通过原子测试,无遗留单测缺陷。

4.2 与 UTP 用例一一对应:PU-01~08、VU-01~08、CU-01~05、MU-01~06、BU-01~05 全部按预期输出。

4.3 追溯:本报告覆盖 SRS F-001/F-002/F-003/F-006/F-008、P-001、C3/C4/C5 的单元级验证。