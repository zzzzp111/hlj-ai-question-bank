#!/usr/bin/env node
// 服务层原子验证脚本（AGENTS.md §5 后端 service 验证标准）
// 运行：npm run verify（等价 node scripts/verify-services.js）
// 覆盖 4 模块：parseRequirement / validateQuestions（含 B1 一致性强化）/ mockData / buildPrompt
// 全部断言通过 → 退出码 0；任一失败 → 打印失败明细并以非 0 退出。

import { parseRequirement, MODULE_WHITELIST, DEFAULT_CONFIG } from '../src/services/parseRequirement.js';
import { buildPrompt } from '../src/services/buildPrompt.js';
import { buildChatBody } from '../src/services/callLLM.js';
import { validateRaw, validateQuestions, repairQuestion, checkConsistency } from '../src/services/validateQuestions.js';
import { getMockQuestions, MOCK_MODULES, DIFFICULTIES, mockQuestions, mockBank, shuffleOptions } from '../src/services/mockData.js';
import { QUESTION_BANK_TOOLS, QUESTION_BANK_TOOL, searchQuestionBank } from '../src/services/questionBank.js';
import { env } from '../src/config/env.js';

let passed = 0;
const failures = [];

async function ok(name, ...checks) {
  try {
    for (const fn of checks) {
      if (typeof fn === 'function') await fn();
      else if (!fn) throw new Error('断言为假');
    }
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.error(`  ✗ ${name} —— ${err.message}`);
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label ?? '取值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function includesText(text, keyword, label) {
  if (typeof text !== 'string' || !text.includes(keyword)) {
    throw new Error(`${label ?? '文本未包含关键字'}：缺「${keyword}」`);
  }
}

// 合法 GenerateResponse 样例（docs/DATA_SCHEMA.md §3.2 mock:false 示例）
const VALID_RESPONSE = {
  exam: '黑龙江省考',
  subject: '行测',
  module: '资料分析',
  difficulty: '中等',
  questions: [
    {
      id: 'q_1',
      question: '2023 年某省粮食产量为 3200 万吨，2024 年增长 5%，则 2024 年粮食产量为多少万吨？',
      options: { A: '3200', B: '3360', C: '3400', D: '3520' },
      answer: 'B',
      analysis: '现期量 = 基期量 × (1 + 增长率) = 3200 × 1.05 = 3360 万吨，故选 B。',
      knowledgePoint: '增长率',
    },
  ],
};

async function main() {
console.log('[verify-services] parseRequirement 需求解析');
{
  const r = parseRequirement('我黑龙江省考资料分析比较差，给我出3道中等难度的增长率题');
  await ok('完整自然语言示例：exam/subject/module/difficulty/count 全部命中', () => {
    eq(r.exam, '黑龙江省考', 'exam');
    eq(r.subject, '行测', 'subject');
    eq(r.module, '资料分析', 'module');
    eq(r.difficulty, '中等', 'difficulty');
    eq(r.count, 3, 'count');
    includesText(JSON.stringify(r.knowledgePoints), '增长率', 'knowledgePoints');
  });
  await ok('缺省默认值用例', () => {
    const d = parseRequirement('');
    eq(d.exam, DEFAULT_CONFIG.exam, 'exam 默认');
    eq(d.subject, DEFAULT_CONFIG.subject, 'subject 默认');
    eq(d.module, DEFAULT_CONFIG.module, 'module 默认');
    eq(d.difficulty, DEFAULT_CONFIG.difficulty, 'difficulty 默认');
    eq(d.count, DEFAULT_CONFIG.count, 'count 默认');
    eq(d.knowledgePoints.length, 0, '无知识点');
  });
  await ok('overrides 显式字段覆盖 NL 结果', () => {
    const o = parseRequirement('资料分析给我出3道题', { module: '数量关系', count: 5 });
    eq(o.module, '数量关系', 'module 被覆盖');
    eq(o.count, 5, 'count 被覆盖');
  });
  await ok('count 非法截断：15 道 → 10，0 道 → 1，无题量 → 3', () => {
    eq(parseRequirement('给我出15道题').count, 10, '上限截断');
    eq(parseRequirement('给我出0道题').count, 1, '下限截断');
    eq(parseRequirement('随便来几道').count, 3, '默认题量');
  });
  await ok('module 非法值回落「资料分析」', () => {
    const bad = parseRequirement('来5道题', { module: '申论' });
    eq(bad.module, '资料分析', '非法 module 回落默认');
  });
  await ok('模块别名识别：资分/判断推理/言语', () => {
    eq(parseRequirement('给我出几道资分题').module, '资料分析', '资分→资料分析');
    eq(parseRequirement('来一道判断推理题').module, '判断推理', '判断推理');
    eq(parseRequirement('来一题言语题').module, '言语理解与表达', '言语→言语理解与表达');
  });
  await ok('知识点多词识别去重', () => {
    const kp = parseRequirement('想练比重和平均数，再练下增长率');
    eq(kp.knowledgePoints.length, 3, '识别 3 个知识点');
    for (const kw of ['比重', '平均数', '增长率']) includesText(JSON.stringify(kp.knowledgePoints), kw, `知识点 ${kw}`);
  });
  await ok('MODULE_WHITELIST 恰为五大模块', () => {
    eq(MODULE_WHITELIST.length, 5, '白名单数量');
    for (const m of ['言语理解与表达', '判断推理', '数量关系', '资料分析', '常识判断']) {
      includesText(JSON.stringify(MODULE_WHITELIST), m, `白名单含 ${m}`);
    }
  });
}

console.log('\n[verify-services] validateQuestions 四层校验');
{
  const r = validateQuestions(VALID_RESPONSE);
  await ok('合法输出 → ok=true 且题目保留', () => {
    eq(r.ok, true, 'ok');
    eq(r.questions.length, 1, '题量');
    eq(r.errors.length, 0, '无错误');
  });

  const raw = validateRaw(`\`\`\`json\n${JSON.stringify(VALID_RESPONSE, null, 2)}\n\`\`\``);
  await ok('含 ```json 围栏 → 剥取成功且 ok=true', () => {
    eq(raw.ok, true, 'ok');
    eq(raw.questions.length, 1, '题量');
  });

  const bad = validateRaw('这完全不是 JSON 输出');
  await ok('非法 JSON → ok=false 且 errors 非空', () => {
    eq(bad.ok, false, 'ok');
    eq(bad.questions.length, 0, '无题目');
    eq(bad.errors.length > 0, true, '有错误信息');
  });

  const missingOption = validateQuestions({
    ...VALID_RESPONSE,
    questions: [{ ...VALID_RESPONSE.questions[0], options: { A: '1', B: '2', C: '3' } }],
  });
  await ok('缺选项键 → 该题剔除且 ok=false', () => {
    eq(missingOption.ok, false, 'ok');
    eq(missingOption.questions.length, 0, '剔除至空');
    includesText(JSON.stringify(missingOption.errors), '第1题', '错误定位第 1 题');
  });

  const caseRepair = validateQuestions({
    ...VALID_RESPONSE,
    questions: [{ ...VALID_RESPONSE.questions[0], answer: ' c ' }],
  });
  // 任务 B1：本 fixture 触发新的一致性启发式——answer 修复为 'C' 后与解析声明（故选 B）冲突，
  // 它本身就是 B1 要抓的样本：修复层仍应正常归一，整题由 ④ 一致性层拒收（不判为 ok）。
  await ok("answer=' c ' → 修复为 'C'；解析声明 B 冲突 → B1 判不通过", () => {
    const fixed = repairQuestion({ ...VALID_RESPONSE.questions[0], answer: ' c ' });
    eq(fixed.answer, 'C', 'repairQuestion 归一');
    eq(caseRepair.ok, false, 'ok=false（B1 一致性拒绝，整组触发重生成/Mock 兜底）');
    eq(caseRepair.questions.length, 0, '剔除后无保留题目');
    includesText(JSON.stringify(caseRepair.errors), '解析声明的答案 B 与 answer=C 不一致', 'B1 冲突错误');
  });

  const emptyQ = validateQuestions({ ...VALID_RESPONSE, questions: [] });
  await ok('questions 空数组 → ok=false', () => {
    eq(emptyQ.ok, false, 'ok');
    eq(emptyQ.questions.length, 0, '无题目');
  });

  const noKp = validateQuestions({
    ...VALID_RESPONSE,
    questions: [{ ...VALID_RESPONSE.questions[0], knowledgePoint: undefined }],
  });
  await ok('knowledgePoint 缺省 → 仅 warning 且 ok=true', () => {
    eq(noKp.ok, true, 'ok');
    eq(noKp.warnings.length, 1, '产生 warning');
    includesText(JSON.stringify(noKp.warnings), 'knowledgePoint', 'warning 内容');
  });

  const repaired = repairQuestion({
    question: '  带空格的题干  ',
    options: { A: ' a ', B: ' b ', C: ' c ', D: ' d ', E: '剥离' },
    answer: ' c ',
    analysis: '  解析  ',
    knowledgePoint: ' 增长率 ',
  });
  await ok('repairQuestion：字段 trim + answer 归一 + options 冗余键剔除', () => {
    if (!repaired) throw new Error('修复返回 null');
    eq(repaired.question, '带空格的题干', '题干 trim');
    eq(repaired.answer, 'C', 'answer 归一');
    eq(repaired.options.A, 'a', '选项 trim');
    eq('E' in repaired.options, false, '冗余键剔除');
    eq(repaired.analysis, '解析', '解析 trim');
  });
}

console.log('\n[verify-services] B1 一致性层强化（checkConsistency）');
{
  await ok('checkConsistency 可导出；正常题（解析声明=answer、选项互异）无 errors/warnings', () => {
    const clean = checkConsistency(VALID_RESPONSE.questions[0]);
    eq(clean.errors.length, 0, '无错误');
    eq(clean.warnings.length, 0, '无警告');
  });
  await ok('「答案为B」式声明与 answer 一致 → 无冲突错误', () => {
    const c = checkConsistency({ ...VALID_RESPONSE.questions[0], analysis: '本题列式计算后答案为B。' });
    eq(c.errors.length, 0, '无错误');
  });
  await ok('两选项归一化后完全相同 → 判不通过（ok=false）', () => {
    const dup = validateQuestions({
      ...VALID_RESPONSE,
      questions: [{ ...VALID_RESPONSE.questions[0], options: { A: '3360', B: '3360', C: '3400', D: '3520' } }],
    });
    eq(dup.ok, false, 'ok=false');
    includesText(JSON.stringify(dup.errors), '选项 A 与选项 B 内容重复', '重复错误信息');
  });
  await ok('解析声明与 answer 冲突 → 判不通过（ok=false）', () => {
    const conflict = validateQuestions({
      ...VALID_RESPONSE,
      questions: [{ ...VALID_RESPONSE.questions[0], answer: 'C', analysis: '现期量计算后为 3360 万吨，故选 B。' }],
    });
    eq(conflict.ok, false, 'ok=false');
    includesText(JSON.stringify(conflict.errors), '解析声明的答案 B 与 answer=C 不一致', '冲突错误信息');
  });
  await ok('选项互为超长子串 → 仅 warning 复核，ok=true', () => {
    const similar = validateQuestions({
      ...VALID_RESPONSE,
      questions: [{ ...VALID_RESPONSE.questions[0], options: { A: '3360', B: '3360 万吨', C: '3400', D: '3520' } }],
    });
    eq(similar.ok, true, 'ok=true（warning 不拒收）');
    includesText(JSON.stringify(similar.warnings), '选项 A 与选项 B 相似，请复核', '相似警告信息');
  });
}

console.log('\n[verify-services] mockData 题库完整性');
{
  await ok('每模块 ≥30 题且 count=10 可出满（Wave 13 扩容 150 题）', () => {
    for (const m of MOCK_MODULES) {
      const n = mockQuestions.filter((q) => q.id.startsWith(`mock_${m}_`)).length;
      if (n < 30) throw new Error(`模块「${m}」仅 ${n} 题，需 ≥30`);
      if (getMockQuestions({ module: m, count: 10 }).length !== 10) throw new Error(`模块「${m}」count=10 出不满`);
    }
  });
  await ok('每题符合 §4 Question 结构且答案与选项键一致', () => {
    if (mockQuestions.length === 0) throw new Error('题库为空');
    for (const q of mockQuestions) {
      const keys = Object.keys(q.options);
      if (!['A', 'B', 'C', 'D'].every((k) => keys.includes(k))) throw new Error(`题 ${q.id} options 键不全`);
      if (!['A', 'B', 'C', 'D'].includes(q.answer) || !(q.answer in q.options)) throw new Error(`题 ${q.id} answer 非法`);
      if (!q.question || !q.analysis || !q.knowledgePoint) throw new Error(`题 ${q.id} 字段为空`);
      if (keys.some((k) => typeof q.options[k] !== 'string' || !q.options[k].trim())) throw new Error(`题 ${q.id} 选项为空`);
    }
  });
  await ok('id 全局唯一（mock_<module>_<n> 前缀）', () => {
    const ids = mockQuestions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) throw new Error('存在重复 id');
    for (const id of ids) {
      if (!/^mock_[\u4e00-\u9fa5]+_\d+$/.test(id)) throw new Error(`id 不符合 mock_<module>_<n>：${id}`);
    }
  });
  await ok('难度混合（简单/中等/困难均可命中筛选）', () => {
    for (const d of DIFFICULTIES) {
      if (getMockQuestions({ difficulty: d }).length === 0) throw new Error(`难度「${d}」无题目`);
    }
  });
  await ok('至少含一道「增长率」知识点题', () => {
    if (!mockQuestions.some((q) => q.knowledgePoint === '增长率')) throw new Error('缺增长率题');
  });
  await ok('getMockQuestions 筛选：module / count', () => {
    const byModule = getMockQuestions({ module: '判断推理' });
    if (byModule.length !== 30) throw new Error(`module 筛选应 30 题，实际 ${byModule.length}`);
    if (!byModule.every((q) => q.id.startsWith('mock_判断推理_'))) throw new Error('module 筛选混入其他模块');
    if (getMockQuestions({ count: 2 }).length !== 2) throw new Error('count 截断失败');
    if (getMockQuestions({ module: '资料分析', count: 2 }).length !== 2) throw new Error('module+count 组合失败');
  });
  await ok('mockBank 全量过 B1 一致性守门（解析声明=answer、无错误；Wave 13 全量 150 条质检）', () => {
    if (mockBank.length !== 150) throw new Error(`题库应 150 条，实际 ${mockBank.length}`);
    for (const entry of mockBank) {
      const r = checkConsistency(entry.question);
      if (r.errors.length > 0) throw new Error(`题 ${entry.question.id} B1 错误：${r.errors.join('；')}`);
    }
  });
  ok('shuffleOptions：选项乱序后结构不变且解析声明同步（10 轮）', () => {
    for (let i = 0; i < 10; i += 1) {
      const src = {
        id: 'q_t', question: '题干', options: { A: '甲', B: '乙', C: '丙', D: '丁' },
        answer: 'C', analysis: '计算后故选 C，其余为干扰项。',
      };
      const out = shuffleOptions(src);
      const keys = Object.keys(out.options).sort();
      if (keys.join('') !== 'ABCD') throw new Error(`键不齐:${keys.join('')}`);
      const sortedVals = (o) => Object.values(o).slice().sort().join(',');
      if (sortedVals(out.options) !== sortedVals(src.options)) throw new Error('选项值集合被改变');
      if (out.options[out.answer] !== src.options[src.answer]) throw new Error(`answer 指向错误:${out.options[out.answer]}`);
      const m = out.analysis.match(/故选\s*([A-D])/);
      if (!m || m[1] !== out.answer) throw new Error(`解析声明未随 answer 同步:${out.analysis} answer=${out.answer}`);
      if (Object.keys(src.options).length !== 4 || src.answer !== 'C') throw new Error('源对象被修改');
    }
  });
  ok('shuffleOptions：20 轮洗牌至少发生一次换位（伪随机有效性）', () => {
    let moved = 0;
    for (let i = 0; i < 20; i += 1) {
      const a = shuffleOptions({ id: 'x', question: 'q', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'A', analysis: '故选 A。' });
      if (a.answer !== 'A') moved += 1;
    }
    if (moved === 0) throw new Error('20 次洗牌未发生任何换位，疑似非随机');
  });
}

console.log('\n[verify-services] buildPrompt 提示词组装');
{
  const { system, user } = buildPrompt({
    exam: '黑龙江省考',
    subject: '行测',
    module: '资料分析',
    difficulty: '中等',
    count: 3,
    knowledgePoints: ['增长率'],
  });
  await ok('system 含 JSON 输出要求与考试地区信息', () => {
    includesText(system, '仅输出 JSON', 'JSON 指令');
    includesText(system, '黑龙江省考', '地区');
    includesText(system, '行测', '科目');
    includesText(system, '禁', '质量约束');
  });
  await ok('system 含 function calling 检索指引（search_question_bank）', () => {
    includesText(system, 'search_question_bank', '工具名');
    includesText(system, '题库素材', '素材指引');
    includesText(system, '严禁凭空编造', '禁编造约束');
  });
  ok('system 含思考引导（内部推演不入答案，Wave 11）', () => {
    includesText(system, '内部推演', '思考要求');
    includesText(system, '严禁出现在输出中', '思考不入答案');
  });
  await ok('system 不再内嵌硬编码知识点表（Wave 9 去硬编码）', () => {
    for (const kw of ['本模块知识点范围', '基期、现期', '主旨概括', '工程问题']) {
      if (system.includes(kw)) throw new Error(`硬编码知识点残留：${kw}`);
    }
  });
  await ok('user 含模块/题量/难度/知识点', () => {
    includesText(user, '资料分析', '模块');
    includesText(user, '3 道', '题量');
    includesText(user, '中等', '难度');
    includesText(user, '增长率', '知识点');
  });
  await ok('context 存在时追加「风格延续 / 不重复」', () => {
    const c = buildPrompt({
      module: '资料分析', count: 1, difficulty: '中等',
      context: { knowledgePoint: '增长率', difficulty: '中等', excludedIds: ['q_1', 'q_2'] },
    });
    includesText(c.user, '风格延续上一道题', '风格延续');
    includesText(c.user, 'q_1', 'excludedIds');
    includesText(c.user, '不得与以下已出题重复', '不重复约束');
  });
  await ok('QUESTION_BANK_TOOLS 结构合法：search_question_bank / module 必填枚举五模块', () => {
    eq(QUESTION_BANK_TOOLS.length, 1, '单工具');
    eq(QUESTION_BANK_TOOLS[0].type, 'function', 'tools[0].type');
    const fn = QUESTION_BANK_TOOL.function;
    eq(fn.name, 'search_question_bank', '工具名');
    eq(fn.parameters.required.join(','), 'module', '必填参数');
    eq(fn.parameters.properties.module.enum.length, 5, '模块枚举五值');
    for (const m of ['言语理解与表达', '判断推理', '数量关系', '资料分析', '常识判断']) {
      includesText(JSON.stringify(fn.parameters.properties.module.enum), m, `模块枚举含 ${m}`);
    }
  });
}

console.log('\n[verify-services] callLLM 请求体组装（buildChatBody，Wave 11）');
{
  ok('buildChatBody：默认体含 model/messages，无 tools/reasoning_effort 键', () => {
    const body = buildChatBody('deepseek-chat', [{ role: 'user', content: 'hi' }]);
    eq(body.model, 'deepseek-chat', 'model');
    eq(body.messages.length, 1, 'messages');
    eq(body.temperature, 0.7, 'temperature');
    if ('tools' in body || 'reasoning_effort' in body) throw new Error('不应出现 tools/reasoning_effort');
  });
  ok('buildChatBody：tools 透传 + reasoning_effort=medium 写入', () => {
    const tools = [{ type: 'function', function: { name: 'x' } }];
    const body = buildChatBody('m', [{ role: 'user', content: 'hi' }], tools, 'medium');
    eq(body.tools.length, 1, 'tools');
    eq(body.reasoning_effort, 'medium', 'reasoning_effort');
  });
  ok('buildChatBody：非法 reasoning_effort 忽略（不写入请求体）', () => {
    const body = buildChatBody('m', [], undefined, '超强');
    if ('reasoning_effort' in body) throw new Error('非法枚举不应写入');
  });
}

console.log('\n[verify-services] questionBank 题库检索（function calling 数据源）');
{
  await ok('本地种子：五大模块均可检索出素材（limit=1）', async () => {
    for (const m of MOCK_MODULES) {
      const r = await searchQuestionBank({ module: m, limit: 1 });
      if (!r.ok) throw new Error(`模块「${m}」ok=false`);
      if (r.total < 1) throw new Error(`模块「${m}」无素材`);
    }
  });
  await ok('资料分析 limit=3：条数/字段完整/结构合法', async () => {
    const r = await searchQuestionBank({ module: '资料分析', limit: 3 });
    eq(r.total, 3, 'total');
    for (const it of r.items) {
      if (!it.question.trim()) throw new Error('题干为空');
      const keys = Object.keys(it.options).sort();
      if (keys.join('') !== 'ABCD') throw new Error(`options 键不齐:${keys.join('')}`);
      if (!['A', 'B', 'C', 'D'].includes(it.answer)) throw new Error(`answer=${it.answer} 非法`);
      if (!it.knowledgePoint.trim()) throw new Error('knowledgePoint 为空');
    }
  });
  await ok('topic 关键词过滤：增长率 → 全条目命中', async () => {
    const r = await searchQuestionBank({ module: '资料分析', topic: '增长率', limit: 10 });
    if (r.total < 1) throw new Error('增长率应至少 1 条');
    for (const it of r.items) {
      const hay = `${it.question} ${it.knowledgePoint} ${it.analysis}`;
      if (!hay.includes('增长率')) throw new Error(`条目未命中关键词:${it.id}`);
    }
  });
  await ok('difficulty 过滤：困难 → 全条目难度=困难', async () => {
    const r = await searchQuestionBank({ module: '判断推理', difficulty: '困难', limit: 10 });
    if (r.total < 1) throw new Error('困难档应至少 1 条');
    for (const it of r.items) {
      if (it.difficulty !== '困难') throw new Error(`难度不符:${it.id}`);
    }
  });
  await ok('非法模块 → ok:false 且 error 非空', async () => {
    const r = await searchQuestionBank({ module: '申论' });
    eq(r.ok, false, 'ok');
    if (!r.error) throw new Error('缺 error 字段');
  });
  await ok('limit 归一：99 截断为 10、非数字回落默认 5', async () => {
    const a = await searchQuestionBank({ module: '资料分析', limit: 99 });
    eq(a.query.limit, 10, '99→10');
    const b = await searchQuestionBank({ module: '资料分析', limit: 'abc' });
    eq(b.query.limit, 5, 'abc→5');
  });
  await ok('远程未配置时回退本地种子（source=local，网络零依赖）', async () => {
    const saved = env.questionBankApiUrl;
    try {
      env.questionBankApiUrl = '';
      const r = await searchQuestionBank({ module: '资料分析', limit: 2 });
      eq(r.ok, true, 'ok');
      eq(r.source, 'local', 'source');
      eq(r.total, 2, 'total');
    } finally {
      env.questionBankApiUrl = saved;
    }
  });
}

}

await main();

console.log(`\n[verify-services] 结果：${passed} 项通过，${failures.length} 项失败`);
if (failures.length > 0) {
  console.error('失败明细：');
  for (const f of failures) console.error(`  - ${f.name}: ${f.message}`);
  process.exit(1);
} else {
  console.log('[verify-services] 全部 PASS');
}