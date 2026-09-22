## Handoff: team-plan → team-exec（交付前最终复核）

- **Decided**: 用 4 个并行 worker 交叉复核交付物:①文档族 24 份存在性/命名/编号 ②COMPLIANCE 矩阵 vs docx 190 段覆盖 ③三连测试 + TODO/硬编码扫描 ④前后端契约逐字一致性。均只读,不写代码,零冲突。
- **Rejected**: 单 agent 串行复核(慢且无交叉验证价值);真实 LLM 接入实测(用户未提供 Key,环境无凭据——本轮不重复)。
- **Risks**: W3 测试可能受端口占用影响(e2e 用 3199 独立端口,已规避);W2 依赖 COMPLIANCE.md 当前内容,若检出缺口按矩阵追加记录但**不改代码**。
- **Files**: .omc/handoffs/team-plan.md;核对基线 = 根目录 docx(`全栈开发测试任务_黑龙江省考AI出题Agent_3小.docx`)。
- **Remaining**: worker 四路结果 → team-verify 汇总为原子 PASS/FAIL 交付裁决;若 W2/W4 发现缺口,产出"差异清单+建议"由 lead 决定是否修复(默认只记录,交付优先)。