# REGRESSION — 黑龙江省考 AI 出题 Agent（Wave 4 端到端联调回归记录）

> 产出者：QA 子代理（C4.1 集群）　|　日期：2026-09-22
> 范围：后端起止 / 前端联调 / 页面级端到端闭环 / 健壮性边界 / README 从零复现
> 约束遵守：本次回归**未修改任何业务代码、未安装任何依赖**；发现问题仅记录为缺陷 + 最小修复建议，交由主 Agent 裁决。

## 0. 环境

| 项 | 实测值 |
|----|--------|
| 系统 / Node | macOS；Node v22.23.0（两个子项目 package.json 均声明 ESM） |
| 后端 | `server`，端口 3001（`npm run dev` 启动） |
| 前端 | `web`，端口 5173，`/api` 代理 → 3001（`npm run dev` 启动） |
| 密钥 | **未配置 `server/.env`**（无 `LLM_API_KEY`）→ 全程 Mock 模式（C4 双轨兜底） |
| 浏览器 | Playwright + Chromium（本机 ms-playwright/chromium-1243） |
| 证据脚本 | `/tmp/e2e-regression/`：`phase1.mjs`（21 项页面断言）、`phase2.mjs`/`phase2b.mjs`（后端不可达降级）、`diag6.mjs`（防重诊断）、`phase9-readme-checklist.js`（README §4.3 清单）、`smoke.mjs`（curl 探活） |
| 输出留档 | `/tmp/e2e-regression/log.phase1.txt`（21 PASS / 0 FAIL 完整输出） |

---

## 1. 后端接口级断言（curl / Node 内联）

| 用例 | 操作 | 实测结果 | 结论 |
|------|------|----------|------|
| A1 空体默认出题 | `POST /api/generate` 空 body | 200，`mock:true`，module=资料分析、difficulty=中等、count=3（默认值生效），字段齐全 | **PASS** |
| A2 NL 解析 | body 含自然语言（"来 3 道数量关系的难题"等） | module/count/difficulty 关键字均命中并生效 | **PASS** |
| A3 非法 JSON 体 | body 为非 JSON 文本 | 400（结构化错误码） | **PASS**（符合 DATA_SCHEMA 错误规范） |
| A4 缺 module 回落 | body 无 module 字段 | 回落默认资料分析，200 | **PASS** |
| A5 context 透传 | body 带 `context` | 上下文原样进入生成流程，不报错 | **PASS** |
| A6 追问讲解 | `POST /api/explain` | 返回非空讲解内容 | **PASS** |
| A7 非法 module 显式值 | `{"module":"不存在的模块"}` | 200 + `mock:true` + 回落默认资料分析（**未按规范返回 400**） | **FAIL → R1** |
| A8 count 显式越界 | `{"count":99}` | 200 + `mock:true` + 默认 3 题（**未按规范返回 400**） | **FAIL → R2** |

---

## 2. 页面级端到端（9 项回归清单）

| # | 回归项 | 操作 | 实测证据 | 结论 |
|---|--------|------|----------|------|
| ① | 正常配置闭环 | 选 资料分析 / 中等 / 3 → 生成题目 → 逐题作答 → 提交 | 3 张题卡；提交后判题「错误」×3（答 B/B/A vs 对 C/C/B）；正确答案徽章 ×3；汇总「共 3 题 答对 0 答错 3 正确率 0%」；面板含「正确答案」「解析」 | **PASS** |
| ② | 纯自然语言出题 | 仅输入 NL 需求 → 生成 | module=资料分析、count=3、difficulty=中等，knowledgePoint 含「增长率」（OR 条件成立），闭环出题→作答→判题成功 | **PASS** |
| ③ | Mock 模式标识 | 无 Key 环境出题 | 响应 `mock:true`；页面显示「Mock 模式」徽标 | **PASS** |
| ④ | 答案隐藏（C2） | 生成后 / 已作答未提交两时点审计 DOM | `innerText` 无「正确答案/解析/参考答案/正确选项/【答案】」等字样；`title/aria-*/data-*` 属性零泄露（attrHits=[]、answerLeak=0）；后端响应确含 answer/analysis（内存持有、渲染层剥离） | **PASS** |
| ⑤ | 后端不可达降级 | 停后端 → 点生成 → 出错误条 → 重启后端点「重试」 | 错误条出现且含「重试」按钮、页面不白屏；重试后恢复 3 题卡。但错误文案为「未知错误」(code 500) 而非设计预期「网络异常…」(503) | **部分 FAIL → R4** |
| ⑥ | 防重复提交 | 连续两次 page.click / 同帧双击 | 场景A（间隔≈31ms）产生 2 个请求（req@48ms / 79ms，Mock 响应≈22ms，按钮已恢复）；场景B 同帧双击 2 请求（req@5ms、6ms）。防重仅靠 DOM `disabled`，无 JS 在途锁 | **FAIL → R3** |
| ⑦ | 判题解析展示（含汇总统计） | 提交后检查结果面板 | 三区（对错标识 / 正确答案 + 解析 / 汇总统计）完整呈现（见 ①） | **PASS** |
| ⑧ | 构建与原子验证 | `npm run verify`（服务层）+ `npm run build`（前端） | verify：**27 项通过，0 项失败**；build：21 modules、零错误（dist 产物生成） | **PASS** |
| ⑨ | README §4.3 从零启动复现 | 按 README §4 启动双端（与 0 环境一致）→ 逐项对照清单 | 11/11 全过：标题「黑龙江省考 AI 出题 Agent」、h1、三区块布局、代理 health `{"ok":true}`、Mock 徽标、3 题卡、12 个选项、提交按钮启用、判题解析、汇总统计 | **PASS** |

---

## 3. 补充实测项

| 项 | 操作 | 实测证据 | 结论 |
|----|------|----------|------|
| 5 模块不串模块 | 每模块各生成 1 题，核对 module 字段与题干/知识点 | 资料分析(比重)、判断推理(类比推理)、言语理解(意图判断)、数量关系(行程问题)、常识判断(法律常识)——module 与 kps 均落在对应模块范围，无串模块 | **PASS** |
| 学习统计 C3.2 | 多次出题作答后检查 localStorage | `hlj-kaoqa-stats` 累计写入 4 条 | **PASS** |
| 题卡校验四层 | 服务层原子断言 | 见 ⑧ verify 27 项全绿 | **PASS** |

---

## 4. 缺陷清单

| 编号 | 级别 | 现象（实测） | 根因 | 最小修复建议 | 阻塞 |
|------|------|--------------|------|--------------|------|
| **R1** | FAIL-不阻塞 | `{"module":"不存在的模块"}` 返回 200+mock:true+默认资料分析；DATA_SCHEMA §2.2 / API.md 错误码表明确「module 不在白名单 → 400」 | `parseRequirement.js:102` 对非法 module 静默回落默认，未区分「字段缺省」与「显式非法值」 | `routes/generate.js` 在 `_pickOverrides` 之后、parse 之前，对显式提供的非白名单 module 直接 `res.status(400).json({error:{code:400,...}})` | 否 |
| **R2** | FAIL-不阻塞 | `{"count":99}` 返回 200+mock:true（默认 3 题）；DATA_SCHEMA §2.1 / API.md 规定 count∉[1,10] → 400 | `parseRequirement.js:104` 将 count clamp 到 1~10，忽略显式越界语义 | route 层对显式 count 越界直接 400（复用 R1 的校验位置） | 否 |
| **R3** | FAIL-不阻塞 | 连点/双击产生重复 `/api/generate` 请求（Mock 响应过快时按钮提前恢复） | 防重仅靠 DOM `disabled`（ConfigForm `:disabled="loading"`），无 JS 在途锁 | `App.vue` 生成入口（`handleSubmit`/`_runGenerate`）加同步守卫 `if (generating.value) return`（或按 lastBody 去重） | 否 |
| **R4** | 部分 FAIL-不阻塞 | 后端不可达时错误文案为「未知错误」(500)，与设计「网络异常…」(503) 语义不符 | Vite 代理在后端不可达时返回 502 空 body → `client.js _normalizeHttpError(null)` 兜底为 `{code:500,message:'未知错误'}`；错误结构 `{error:{code,message}}` 本身成立 | `client.js`：对「非 2xx 且 body 非 JSON」场景直接返回 `NETWORK_ERROR`（503 网络异常）而非 500 | 否 |
| **R5** | 文档-不阻塞 | `README.md` 仍为 Wave 0 骨架版：波次进度表「Wave 0 进行中 / Wave 1-3 未开始」、模块清单全「未实现」、遗留「待填充 1~6」，与实际全栈已实现状态严重不符，违反 AGENTS.md §6「README 须与真实进度一致」 | README 定稿属 Wave 5 排期，尚未执行 | C5.1 定稿时按实况回填：进度表、模块清单、§4.3 清单状态（本报告 ⑨ 已给出全部实测值）、§9 已知问题（可引用本报告 R1~R4 与 §3 知识点混合特性） | 否 |

> 另外记录一个**已知特性（非缺陷）**：Mock 题库按难度筛选不足请求数时会回退模块池补足，导致知识点混合（如 ② 中 kps=[比重,基期,增长率]）。`routes/generate.js _mockQuestions` 已注释说明该行为；建议在 README 已知限制中同步说明。

---

## 5. 总体结论

- **达成发布标准（可闭环演示）**：9 项回归中，核心链路（出题 → 作答 → 判题 → 解析 → 汇总）全部 PASS；Mock 双轨（C4）、答案隐藏（C2）、统一 JSON（C3）、服务层原子验证（C6/DoD）全部通过；README 从零复现 11/11 全绿。
- 存在问题均为**非阻塞缺陷**：R1/R2（非法入参未 400，属边界语义）、R3（防重缺陷，低风险）、R4（错误文案语义）、R5（README 文档滞后，属 Wave 5 排期）。
- **建议**：放行 Wave 4 → Wave 5；R1~R4 可在 C5.1 一并修复（均为小改动），或明确记录进 README 已知限制；R5 由 C5.1 README 定稿时回填（本报告第 2 节可作回填数据源）。