# 单元测试计划 (UTP)

- **文档标识号**:HLJKS-UTP-001-V1.0
- **状态**:APPROVED
- **项目代号**:HLJKS
- **撰写日期**:2026-09-22
- **执行命令**:`cd server && npm run verify`(入口 `scripts/verify-services.js`)

---

## 1. 测试范围与策略

1.1 范围:server 纯函数服务层五分组(parseRequirement / validateQuestions 四层 / checkConsistency / mockData / buildPrompt);HTTP 与端到端行为见 ITD/STD。

1.2 策略:每函数一组断言,结果二值化(全部 PASS 或存在 FAIL 即不通过);无第三方测试框架,使用自定义断言脚本与 node:test。

1.3 覆盖率目标:对本计划所列分组函数的语句覆盖 100%(以通过全部断言为准);LLM 真实调用链路(无 Key)不在单测范围,见 §4。

## 2. 用例清单(与 F 号追溯)

### 2.1 分组 PARSER — parseRequirement(8 断言)

| 用例号 | 输入 | 预期 | 追溯 |
|---|---|---|---|
| PU-01 | 空串 | 返回 DEFAULT_CONFIG(资料分析/中等/3 题) | F-001/F-002 |
| PU-02 | 「来 1 道资料分析题」 | count=1,module=资料分析 | F-001 |
| PU-03 | 空白/全空格 | 默认回落 | F-001 |
| PU-04 | 未识别模块 | DEFAULT.module 回落 | F-001 |
| PU-05 | 别名「资分」 | 归一为 资料分析 | F-001 |
| PU-06 | count=99/非整数 | 截断/回落(99 → 回落非数字) | P-001 |
| PU-07 | count=15 | 截断为 10 | P-001 |
| PU-08 | count=0 | 回落 1 | P-001 |

### 2.2 分组 VALIDATE — validateQuestions 四层(8 断言)

| 用例号 | 场景 | 预期 | 追溯 |
|---|---|---|---|
| VU-01 | 合法题组 | ok=true | F-003 |
| VU-02 | 缺题干 | ok=false | F-003 |
| VU-03 | 缺选项/选项数≠4 | ok=false | F-003 |
| VU-04 | 缺答案 | ok=false | F-003 |
| VU-05 | 缺解析 | ok=false | F-003 |
| VU-06 | 选项为空串 | ok=false | F-003 |
| VU-07 | 修正:空白答案 `' c '` | repair 后与选项一致 | F-003 |
| VU-08 | errors/warnings 结构 | 错误以数组返回,含 code | F-003 |

### 2.3 分组 CONSISTENCY — checkConsistency(5 断言)

| 用例号 | 场景 | 预期 | 追溯 |
|---|---|---|---|
| CU-01 | 选项完全重复 | error,ok=false | F-003 |
| CU-02 | 解析指向≠答案 | error,ok=false | F-003 |
| CU-03 | 互为超长子串 | warning(不阻断) | F-003 |
| CU-04 | 完全一致题组 | 通过 | F-003 |
| CU-05 | 对外导出可用 | 命名导出存在且可调用 | F-003 |

### 2.4 分组 MOCK — mockData(6 断言)

| 用例号 | 场景 | 预期 | 追溯 |
|---|---|---|---|
| MU-01 | 任意白名单模块返回 count 题 | 数量吻合 | F-008/C4 |
| MU-02 | id 前缀 `mock_<module>_<n>` | 前缀正确 | F-008 |
| MU-03 | 含「增长率」知识点题 | 资料分析命中 | F-008 |
| MU-04 | count 截断(>10) | ≤10 | P-001 |
| MU-05 | MOCK_MODULES 导出 | 五个模块存在 | F-008 |
| MU-06 | DIFFICULTIES 导出 | 难度枚举存在 | F-008 |

### 2.5 分组 PROMPT — buildPrompt(5 断言)

| 用例号 | 场景 | 预期 | 追溯 |
|---|---|---|---|
| BU-01 | 返回 system+user | 结构完整 | F-002/C3 |
| BU-02 | system 含七步约束 | 角色/格式/字段/校验齐备 | C3/C5 |
| BU-03 | user 含模块/题量/难度/知识点 | 配置透传 | F-002 |
| BU-04 | context 追加风格延续/不重复 | 上下文注入 | F-008 |
| BU-05 | MODULE_KNOWLEDGE 存在 | 模块知识点映射可用 | F-008 |

## 3. 通过标准

3.1 32 条断言全部 PASS(8+8+5+6+5=32)。

3.2 任一断言 FAIL → 该分组不通过,整轮 verify 失败退出非 0;修复后重跑至全绿。

## 4. 范围外说明

4.1 callLLM 真实 API 调用:因无 LLM_API_KEY 未能实测,路由层由 Mock 双轨兜底保证契约(见 UTR/TSR 遗留风险)。

4.2 前端组件行为、浏览器渲染:见 STD 手工走查部分。