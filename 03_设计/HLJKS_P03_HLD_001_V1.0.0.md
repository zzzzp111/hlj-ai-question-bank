# 概要设计说明 (HLD)

- **文档标识号**:HLJKS-HLD-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS(黑龙江省考 AI 出题 Agent)
- **撰写日期**:2026-09-22
- **前置文档**:HLJKS-P02-SRS-001-V1.0.0、HLJKS-P02-IRS-001-V1.0.0、HLJKS-P02-RTM-001-V1.0.0

---

## 1. 设计目标

1.1 以自然语言(GPT 式对话)与可视化表单(Apple 风格 Web 界面)双入口完成出题,统一输出结构化数据(JSON Schema,见 `docs/DATA_SCHEMA.md`)。

1.2 系统必须满足 SRS 中 F-001~F-008 全部功能需求与 P-001/C1~C6 非功能约束。

1.3 无物理数据库依赖:会话数据走前端内存 + localStorage,LLM 依赖走双轨(真实 API / Mock 兜底),保证本地可交付、可演示、可二次开发。

## 2. 技术栈(与项目实际锁定版本一致)

| 层 | 技术选型 | 版本 | 说明 |
|---|---|---|---|
| 运行时 | Node.js ESM | >=18(server/package.json engines) | `type: module`,`import/export` 语法 |
| 后端框架 | Express | ^4.19.2 | 路由 + 中间件 |
| 后端中间件 | cors | ^2.8.5 | 跨域 |
| 环境变量 | dotenv | ^16.4.5 | `.env` 配置 KEY/BASE_URL/MODEL |
| LLM 接入 | OpenAI 兼容 Chat Completions(自研封装) | — | `fetch` 直连,无第三方 SDK,见 `server/src/services/callLLM.js` |
| 前端框架 | Vue 3 | ^3.5.43 | Composition API |
| 前端构建 | Vite | ^8.3.0 | `web/package.json` scripts: dev/build/preview |
| 前端插件 | @vitejs/plugin-vue | ^6.0.9 | SFC 编译 |
| 本地持储 | localStorage(前端会话统计) | — | key=`hlj-kaoqa-stats`,无则静默降级 |
| 测试 | Node 内置 test runner(node:test) / 自定义断言脚本 | — | 无第三方测试框架依赖 |

2.1 服务端不依赖任何网络类第三方包(LLM 调用使用 Node 原生 fetch),降低部署与审计成本。

## 3. 系统结构(C4 简版)

### 3.1 系统上下文

```
[Web 前端(Vue3, Apple 风格)]  <--HTTP:3000(proxy /api)-->  [Node/Express 后端(:3001)]
        ↑                                                        ↑
        |                                                        |
[浏览器 localStorage(hlj-kaoqa-stats)]              [LLM(OpenAI 兼容,可选) / Mock 数据源(兜底)]
```

### 3.2 容器与模块职责

| 容器 | 模块 | 职责 | 对应源码 |
|---|---|---|---|
| server | 入口 | 装配中间件、挂载路由、启动服务 | `server/src/index.js` |
| server | 通用错误中间件 | 统一错误体 `{error:{code,message}}` 归一 | `server/src/middleware/errorHandler.js` |
| server | 出题路由 | 双入口请求入口,显式参数校验,响应组装 | `server/src/routes/generate.js` |
| server | 解析服务 | 自然语言指令解析 → 结构化配置 | `server/src/services/parseRequirement.js` |
| server | 校验服务 | 出题结果四层校验 + 一致性修复 | `server/src/services/validateQuestions.js` |
| server | 数据服务 | Mock 题库(29 题,双轨兜底) | `server/src/services/mockData.js` |
| server | 提示词服务 | 七步 system + user 组装（Wave 9：工具检索指引，去硬编码知识点表） | `server/src/services/buildPrompt.js` |
| server | 题库检索服务 | function calling 数据源：远程 API 优先 + 本地种子兜底（可插拔） | `server/src/services/questionBank.js` |
| server | LLM 服务 | API 调用、30s 超时、重试 1、function calling(tools 往返)、统一错误分类 | `server/src/services/callLLM.js` |
| server | 解析路由 | 答案解析(已就绪未接线,见 B3) | `server/src/routes/explain.js` |
| server | 健康检查 | GET /api/health 服务可用性 | `server/src/routes/health.js` |
| web | 主视图 | 双入口容器、状态机驱动 | `web/src/App.vue` |
| web | 配置表单 | 可视化出题参数(模块/难度/题量/知识点/排除题) | `web/src/components/ConfigForm.vue` |
| web | 题目卡片 | 题干/选项渲染、答案隐藏、作答交互 | `web/src/components/QuestionCard.vue` |
| web | 结果面板 | 判题结果、解析、学习统计 | `web/src/components/ResultPanel.vue` |
| web | API 客户端 | generate/health 封装,错误归一 | `web/src/api/client.js` |
| web | 统计服务 | 本地作答记录与弱点分析 | `web/src/stats.js` |

### 3.3 数据流(双入口统一路径)

```
自然语言输入 ─┐
              ├→ parseRequirement(默认配置冻结 DEFAULT_CONFIG / 显式覆盖优先)
表单参数输入 ─┘
   → generate 路由(显式参数 400 校验 / 排除集去重)
   → buildPrompt(七步 system + 工具检索指引)
   → callLLM(tools=search_question_bank,超时/重试/Mock 兜底) └→ questionBank(远程 API / 本地种子回退)
   → validateQuestions(四层校验 + checkConsistency 修复)
   → 响应 GenerateResponse(统一 Schema,题目答案隐藏渲染)
   → QuestionCard 作答 → 判题(correct/explanation)
   → stats.js 记录 → ResultPanel 展示准确率与弱点
```

## 4. 模块边界约束

4.1 **无循环依赖**:services 层为单向依赖链(parse→buildPrompt→callLLM→validate→mockData),routes 依赖 services,routes 之间无互相 import,前端组件仅 App.vue 单向引用三个子组件。

4.2 **层间通信**:server 内部模块以函数签名/导出常量通信,不共享可变全局状态(仅 DEFAULT_CONFIG 为 Object.freeze 只读常量)。

4.3 **前后端契约**:HTTP 层接口与错误体统一定义于 HLJKS-P03-IDD-001;数据结构定义于 `docs/DATA_SCHEMA.md`。

## 5. 关键设计决策

| 编号 | 决策 | 理由 |
|---|---|---|
| D-01 | 双轨数据源(LLM 可用走 LLM,否则 Mock 兜底) | C4 约束 + 无 Key 环境可演示 |
| D-02 | 答案不在题面下发,前端本地保存后渲染 | C2 约束 |
| D-03 | 显式表单参数严格 400,自然语言语义词法宽松回落 | 表单是契约,对话是意图,分而治之 |
| D-04 | 全局统一错误体 `{error:{code,message}}` | 前端归一,减少分支 |
| D-05 | 无物理数据库,localStorage 单键记录 | 3 小时时限内最小交付面 |
| D-06 | 提示词去硬编码:知识点/题库素材经 function calling 工具 search_question_bank 动态检索(远程 API 可插拔 + 本地种子兜底) | Wave 9 用户要求:最新题库可联网获取,新增题目素材无需改代码 |

## 6. 部署拓扑

6.1 开发态:server `npm run dev`(:3001)+ web `npm run dev`(Vite :5173,proxy /api→:3001;Wave 9 修订:端口为 5173)。

6.2 生产态:web `npm run build` 生成静态资源,由静态服务器(或后端挂载)提供服务;API 仍由 Express 提供。详见 `docs/ARCHITECTURE.md` 与 README §4 启动说明。

## 7. 需求追溯

本设计覆盖 SRS 全部 F-001~F-008、P-001、C1~C6;逐条映射见 HLJKS-P02-RTM-001 矩阵。