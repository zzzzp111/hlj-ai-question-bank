## Handoff: team-plan → team-exec（Mock 题库扩容至 150 题）

- **Decided**: 目标 150 题(五模块各 30:现有各 10,每模块 +20,共 +100)。采用"5 worker 并行、各自写独立 JSON 文件、lead 统一合并"规避共享文件并发写(AI-CODING 错误 4 教训)。新题 id 从 `mock_<模块>_11` 起(1~10 已占用)。
- **Rejected**: 直接并行写 mockData.js(共享文件冲突风险);串行逐模块(耗时过长)。
- **Risks**: 新题质量(B1 校验会拒坏题)——worker 自检 + lead 合并时统一跑结构校验与 B1 全量守门;编号连续性——lead 合并时断言。
- **Files**: 输出 `.omc/w12-题库/<模块>.json`(JSON 数组);合并目标 `server/src/services/mockData.js` `_bank` 数组。
- **Remaining**: 5 worker 各产出 20 条自洽题 → lead 校验合并 → verify 断言升级(≥30/150 条)→ 三连测试 → 文档同步。