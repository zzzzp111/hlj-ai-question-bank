# 项目开发计划（DEV）

- **文档标识号**：HLJKS-DEV-001-V1.0
- **状态**：APPROVED（已交付）｜ 支撑：`docs/CLUSTERS.md`（集群编排权威定义）、`AI-CODING.md`（执行记录）

---

## 1. WBS 工作分解

| 门户编号 | 工作包 | 子项 | 对应波次 |
|---|---|---|---|
| WBS-1 | 需求与规划 | 需求拆解、时间评估、强制约束（AGENTS.md）、集群编排（CLUSTERS.md） | Wave 0 |
| WBS-2 | 文档底座 | ARCHITECTURE / API / DATA_SCHEMA / REGRESSION 骨架 / SKILL | Wave 0 |
| WBS-3 | 脚手架 | server 骨架（Express ESM 分层）、web 骨架（Vite+Vue3） | Wave 1 |
| WBS-4 | 后端 | 服务层五件套（parse/buildPrompt/callLLM/validate/mock）+ 路由七步流程 | Wave 2 |
| WBS-5 | 前端 | 配置表单 + 题卡渲染（答案隐藏）+ 答案判题 + 学习统计 | Wave 3 |
| WBS-6 | 联调 | 端到端回归 R1~R4 + REGRESSION.md | Wave 4 |
| WBS-7 | 收尾/加分 | B1 校验强化、B2 再来一道、B3 后端骨架、文档定稿 | Wave 5 |
| WBS-8 | 视觉 | Apple 风格 UI（全局色板/胶囊/毛玻璃/分段）+ 原子性审计 | Wave 6 |
| WBS-9 | 交付 | 全量三连测试 + A 级文档族（24 份）+ 二次代码验证 + 文档更新 | Wave 7 |

## 2. 进度表（计划 vs 实际）

| 波次 | 计划内容 | 计划用时 | 实际用时 | 偏差 |
|---|---|---|---|---|
| Wave 0~1 | 文档+脚手架 | ≤20 分钟 | 按时间盒 | 无 |
| Wave 2 | 后端 | ≤20 分钟 | 含错误 1 返工 | 返工 1 次 |
| Wave 3 | 前端 | ≤20 分钟 | 含错误 2 返工 | 返工 1 次 |
| Wave 4 | 联调回归 | ≤10 分钟 | 检出 R1~R4 | 无 |
| Wave 5 | 收尾+加分 | ≤20 分钟 | 含错误 4 返工 | 返工 1 次 |
| Wave 6 | Apple 风格 | ≤20 分钟 | 三分支回归 | 无 |
| Wave 7 | 全量测试+文档族 | ≤20 分钟 | 本次执行 | 无 |

> 纪律：开发段 ≤20 分钟写完即测；测试段 ≤10 分钟测完即做业务逻辑测试；同模块修 3 次未成功即更换方案（《开发流程…》§4.2 时间盒）。

## 3. 资源分配

| 资源 | 角色 | 说明 |
|---|---|---|
| 主 Agent（NightHawk CLI） | 编排/验收/定稿 | 波次间验证与放行（AGENTS.md §8） |
| 子代理（coder/explore/plan） | 原子实现 | 每次携带独立上下文与精确原子提示词（docs/CLUSTERS.md） |
| AgentSwarm | 并行集群 | 适用于可并行的独立原子任务（如 Wave 0 文档集群） |
| 本机工具链 | Node 18+ / npm / curl / 浏览器 | 原子验证手段（AGENTS.md §5、§7） |

## 4. 开发方法：模块化闭环

1. 每个模块 = 一个原子任务集群，附带精确原子提示词（docs/CLUSTERS.md 逐集群列示）。
2. 集群完成 → 主 Agent 原子测试（verify / e2e / build / curl）→ **通过或不通过二值结论**。
3. 通过才允许流入下游；不通过立即修复，修 3 次未成功即更换方案（控制时间盒）。
4. 加分项在基础项闭环之后执行，每个加分项可独立砍掉以保交付（《开发流程…》§8）。

## 5. 交付物清单

| 交付物 | 位置 | 验收方式 |
|---|---|---|
| 完整源码 | `server/` + `web/` | verify 32 + e2e 8 + build 绿 |
| 可运行 Demo | 双端启动（README §4） | 验收路径可复现 |
| 运行手册 | `README.md`（Wave 7 更新） | 照做可复现 |
| AI 复盘 | `AI-CODING.md`（Wave 7 更新） | 真实可复盘 |
| 需求符合性 | `docs/COMPLIANCE.md` | 逐条矩阵可审计 |
| A 级文档族 | `01_立项规划/`~`05_交付维护/` 24 份 | 清单齐全（HLJKS-PSR/W7） |
| 二次开发 Skill | `.agents/skills/hlj-kaoqa-dev/SKILL.md` | 新模块接入指南 |