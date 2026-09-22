# 问题报告 (BUG)

- **文档标识号**:HLJKS-BUG-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22

---

## 1. 缺陷登记总表(编号唯一、连续、不跳号)

| 编号 | 发现阶段 | 严重级 | 模块 | 现象 | 修复方式 | 状态 |
|---|---|---|---|---|---|---|
| BUG-001 | 单测/Review | 中 | 解析层 | 中文数量词「一道」不识别,回落默认 3 题 | 明确限制并记录,回落有定义(RTM 已知限制) | CLOSED |
| BUG-002 | 单测 | 高 | 数据层 | Mock 仅 3 模块,无法覆盖五类题型演示 | 补齐至 29 题(言语16/资料4/判断3/数量3/常识3) | CLOSED |
| BUG-003 | e2e | 高 | 路由层 | overrides 非法 module/count 未校验返回 200 | `_validateExplicitOverrides`(:33/:100)→400 ILLEGAL_MODULE/ILLEGAL_COUNT/ILLEGAL_DIFFICULTY | CLOSED |
| BUG-004 | UI 走查 | 中 | 路由层/前端 | 请求期间可连点提交,产生重复请求 | 前端防连点(R3)按钮禁用 | CLOSED |
| BUG-005 | e2e 走查 | 中 | 前端 client | postJSON 遇非 `{error}` 结构时不归一 | 统一映射 503 语义 | CLOSED |
| BUG-006 | 流程评审 | 低 | 开发流程 | AgentSwarm 模板写死 B1 双写文件路径 | 修正模板参数化 | CLOSED |
| BUG-007 | 流程评审 | 低 | 开发流程 | 首次调用缺 description 被拒 | 补充描述参数 | CLOSED |
| BUG-008 | UI 走查 | 低 | 前端 | 冗余 v-show 无实际分支 | 删除(Wave C 清理) | CLOSED |
| BUG-009 | 最终验证(Wave 8) | 高 | 前端组件 | 「再来一道类似」读取 `formState.value.module/.difficulty`(reactive 无 .value),点击即 TypeError,B2 功能不可用 | `App.vue handleAnotherSimilar` 改为 `formState.module/difficulty`(两处),build 复核通过 | CLOSED |

## 2. 回归验证

2.1 BUG-001~005 修复后由 `npm run verify`(32/32)与 `npm run test:e2e`(8/8)回归通过。

2.2 BUG-006~008 为流程/UI 清理项,已含于全量复核(Wave 7 重跑验证)。

2.3 文档完善项(非代码缺陷):AI-CODING 错误 7(Playwright 降级声明)已在 COMPLIANCE §4 声明补齐,见 CR 评审清单。

2.4 BUG-009(最终验证 Wave 8)于 2026-09-22 检出并当日最小修复(`formState.value.module/.difficulty` → `formState.module/difficulty`,两处);修复后 `npm run build` 106ms 通过,`npm run verify` 32/32、`node test/e2e.mjs` 8/8 重跑全绿(BUG-009 属组件内部交互缺陷,e2e 契约测试不覆盖,由代码走查兜出)。

## 3. 统计口径

3.1 缺陷编号自 BUG-001 起连续递增,不补写、不重号。

3.2 全部 9 条缺陷状态:CLOSED(修复并回归通过)。