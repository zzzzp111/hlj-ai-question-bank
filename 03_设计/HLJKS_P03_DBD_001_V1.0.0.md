# 数据库设计说明 (DBD)

- **文档标识号**:HLJKS-DBD-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22
- **设计决策**:D-05(见 HLD)— **系统无物理数据库**

---

## 1. 总体说明

1.1 本项目为 3 小时时限内的演示型交付,数据面设计为**零数据库**:

| 数据 | 存储位置 | 生命周期 |
|---|---|---|
| 出题配置、题组、判题结果 | 前端内存(组件状态) | 会话级 |
| 学习统计 | 浏览器 localStorage(单 key) | 浏览器级,可清理 |
| Mock 题库 | 后端静态内存数据(29 题) | 进程级,只读 |

1.2 追溯:SRS F-007(学习统计)、C4(Mock 双轨)、HLD D-05。

## 2. localStorage 存储设计

### 2.1 存储键

| 键名 | 用途 | 命名规则 |
|---|---|---|
| `hlj-kaoqa-stats` | 作答记录数组(JSON) | `hlj-` 项目前缀 + `kaoqa` 域名 + `-stats` 语义后缀 |

### 2.2 记录结构(逐字段数据字典)

| 字段 | 类型 | 必填 | 值域/约束 | 说明 |
|---|---|---|---|---|
| module | string | 是 | 模块白名单枚举 | 出题模块 |
| knowledgePoint | string | 是 | 知识点文本 | 单知识点字符串 |
| correct | number | 是 | 0 \| 1 | 1=答对,0=答错 |
| total | number | 是 | 恒为 1 | 单次作答计数(便于聚合) |
| ts | number | 是 | 毫秒时间戳 | 作答时间,ISO 口径记录 |

### 2.3 聚合口径(computeStats,`web/src/stats.js`)

| 输出字段 | 计算规则 |
|---|---|
| answeredTotal | 记录总数(Σ total) |
| correctTotal | Σ correct |
| accuracy | correctTotal / answeredTotal,保留 1 位小数 |
| weakPoints | 按知识点聚合答错数降序,取前 ≤2 项;样本数 <3 标注 `insufficient` |

### 2.4 异常与降级

| 场景 | 行为 |
|---|---|
| localStorage 不可用(Safari 隐私模式等) | 内存 Map 静默降级,不抛错、不阻塞作答 |
| JSON 解析失败(被外部篡改) | catch 后按空库处理并重建 |

## 3. 服务端静态数据(Mock 题库)

3.1 数据容器:`server/src/services/mockData.js` 之 `mockQuestions`。

3.2 记录结构 = 与 GenerateResponse.questions[ ] 同构的完整题对象(含 answer/analysis,仅供服务端判题与校验,不下发前端,见 C2)。

3.3 规模与分布(2026-09-22 实测口径):

| 模块 | 题数 |
|---|---|
| 言语理解 | 16 |
| 资料分析 | 4 |
| 判断推理 | 3 |
| 数量关系 | 3 |
| 常识判断 | 3 |
| **合计** | **29** |

3.4 id 规则:`mock_<module拼音>_<序号>`,如 `mock_ziliao_1`;保证排除集去重可用(B2)。

## 4. 题组引用关系

4.1 题目数据结构(Question)与响应结构(GenerateResponse)不在此重复全文,统一定义于 `docs/DATA_SCHEMA.md`(唯一事实源),本节采用符号引用:Question ∈ GenerateResponse.questions。

4.2 变更流程:任何数据结构变更必须同步更新 `docs/DATA_SCHEMA.md` 与 HLJKS-P02-IRS-001,并触发 HLJKS-P02-RTM-001 追溯复核。

## 5. 未来演进出数据库方案

5.1 若后续引入用户体系/题库持久化(建议 SQLite/D1 级轻量方案):按此文档扩展 ER 图(User / AttemptLog / QuestionBank),结构调整需走 CCB 变更流程(见 HLJKS-P01-SCM-001 §4)。