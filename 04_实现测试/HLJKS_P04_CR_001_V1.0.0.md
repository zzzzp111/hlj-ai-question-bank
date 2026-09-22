# 代码规范与评审记录 (CR)

- **文档标识号**:HLJKS-CR-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22

---

## 1. 代码规范(与 AGENTS.md 强制约束一致)

| 类别 | 规则 |
|---|---|
| 模块格式 | 全仓 ESM(`import/export`),`type: module` |
| 命名 | 变量/函数 camelCase;组件/类 PascalCase;常量 UPPER_SNAKE_CASE;私有函数 `_` 前缀 |
| 分层约束 | 后端路由禁止直接写模型调用,必须经 services;前端组件禁止拼接 URL,统一走 `api/client.js` |
| 复杂度 | 单函数复杂度以可测试为准,路由校验函数独立抽取(如 `_validateExplicitOverrides`) |
| 数据契约 | 前端不得依赖未定义字段;结构唯一事实源 `docs/DATA_SCHEMA.md` |
| 注释 | 中文注释说明"为什么",命名表达"是什么" |

## 2. 评审清单(9 项)

| # | 评审项 | 结论 | 处理 |
|---|---|---|---|
| 1 | BUG-001 中文数量词限制 | 通过(有定义回落) | CLOSED |
| 2 | BUG-002 Mock 扩容 29 题 | 通过 | CLOSED |
| 3 | BUG-003 显式参数 400 校验 | 通过 | CLOSED |
| 4 | BUG-004 前端防连点 | 通过 | CLOSED |
| 5 | BUG-005 错误归一 503 | 通过 | CLOSED |
| 6 | BUG-006 swarm 模板写死 | 通过 | CLOSED |
| 7 | BUG-007 缺 description | 通过 | CLOSED |
| 8 | BUG-008 冗余 v-show | 通过 | CLOSED |
| 9 | 文档完善项:Playwright 降级声明 | 通过(非代码缺陷,COMPLIANCE §4 已声明) | 已补 |

## 3. 评审结论

3.1 代码符合 §1 规范;9 项评审全部通过,无遗留未决项。

3.2 规范符合性抽查:verify-services.js 断言分组清晰、routes/generate.js 校验函数独立、web 组件事件全部有真实行为(原子性)。

## 4. 变更跟踪

4.1 全部变更记录于项目 AI-CODING.md 执行日志与 HLJKS-P05-RN-001 变更历史;代码评审与需求追溯见 HLJKS-P02-RTM-001。