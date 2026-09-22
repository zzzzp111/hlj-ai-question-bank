// Prompt 组装服务（出题上下文 → LLM 系统/用户提示词）
// 对应 docs/DATA_SCHEMA.md §2.3/§3 与 AGENTS.md C4（Mock 双轨）、C5（禁编造政策）。
// context 参数为「再来一道类似」（B2）预留：提示词延续风格并去重，见 §2.3。
//
// Wave 9（去硬编码）：模块→知识点映射表已从本文件移除，改为 function calling
// 动态检索——LLM 先调用 search_question_bank 工具获取题库素材，再基于素材命制题目，
// 知识点范围由检索结果决定，不再由提示词写死（素材检索实现见 services/questionBank.js）。

/**
 * 组装系统提示词与用户消息
 * @param {{exam?:string, subject?:string, module?:string, difficulty?:string,
 *          count?:number, knowledgePoints?:string[], context?:object}} params
 * @param {object} [opts] 预留（如测温参数、重试轮次等，本轮不消费）
 * @returns {{system:string, user:string}}
 */
export function buildPrompt(params = {}, opts = {}) {
  const {
    exam = '黑龙江省考',
    subject = '行测',
    module = '资料分析',
    difficulty = '中等',
    count = 3,
    knowledgePoints = [],
    context = null,
  } = params;

  const system = [
    '你是黑龙江省考行测命题经验丰富的出题老师，负责命制符合公考行测规范的模拟练习题。',
    '',
    `请围绕「${module}」模块命制 ${count} 道${difficulty}行测题目。`,
    '',
    '题库素材获取（必须）：',
    `1. 命制前先调用工具 search_question_bank 检索「${module}」模块的题库素材（可传 difficulty/topic 过滤，limit 取值 1~10）；`,
    '2. 基于工具返回的素材命制原创改编题（可在素材基础上变换数据、情境、设问方式）；',
    '3. 知识点范围以工具检索结果为准，严禁凭空编造素材库不支持的题目要点、时政或地区数据。',
    '',
    '命题质量约束：',
    '1. 每题恰有 A/B/C/D 四个选项，且只有一个正确答案；',
    '2. 答案唯一，解析必须阐释选择该答案的依据，且与答案一致；',
    '3. 题干、选项、答案解析之间不得互相矛盾；',
    '4. 题目必须具有公考行测的典型特征（题干严谨、选项规范、解析完整）；',
    '5. 涉及时政、地区数据的表述一律使用通用行测规范，严禁编造黑龙江省考官方政策与数据。',
    '',
    '思考要求（内部推演，不入答案）：',
    '1. 命制每道题前，先在内部推演：考点是什么、给定数据是否自洽、干扰项设计是否合理、答案是否唯一、解析逻辑是否闭环；',
    '2. 内部推演结果（思考过程）严禁出现在输出中——最终只输出 JSON，不得输出任何思考文本、解释或注释。',
    '',
    '输出要求：',
    '1. 仅输出一个 JSON 对象，不要输出任何其他文字、解释或代码围栏；',
    '2. JSON 必须严格符合以下 GenerateResponse 结构（docs/DATA_SCHEMA.md §3）：',
    '{',
    '  "exam": "黑龙江省考",',
    '  "subject": "行测",',
    '  "module": "资料分析",',
    '  "difficulty": "中等",',
    '  "questions": [',
    '    {',
    '      "id": "q_1",',
    '      "question": "题干……",',
    '      "options": { "A": "选项一", "B": "选项二", "C": "选项三", "D": "选项四" },',
    '      "answer": "B",',
    '      "analysis": "解析：……，故选 B。",',
    '      "knowledgePoint": "增长率"',
    '    }',
    '  ]',
    '}',
    '其中：id 形如 q_1 且同一响应内唯一；question 非空；options 恰为 A/B/C/D 四键且值非空；',
    'answer 必须为 A/B/C/D 之一且与 options 键一致；analysis 非空且与答案自洽；knowledgePoint 取自检索素材的知识点。',
    '',
    '仅输出 JSON，不要输出任何其他文字。',
  ].join('\n');

  // 知识侧重：用户显式指定则限定范围；否则交由模型依据工具检索到的素材知识点命制（Wave 9 去硬编码）
  const kpText = Array.isArray(knowledgePoints) && knowledgePoints.length > 0
    ? knowledgePoints.join('、')
    : '不限，请依据工具检索到的题库素材知识点命制';

  const userLines = [
    `围绕「${module}」命制 ${count} 道${difficulty}行测题目。`,
    `考试地区：${exam}；科目：${subject}。`,
    `知识点侧重：${kpText}。`,
  ];

  // B2「再来一道类似」：context 存在时延续风格并声明不重复（excludedIds 由 C2.2 透传）
  if (context && typeof context === 'object') {
    const kpText = context.knowledgePoint ? `知识点相同或相近（延续「${context.knowledgePoint}」）` : '知识点相同或相近';
    const diffText = context.difficulty ? `难度延续「${context.difficulty}」` : '';
    const excludedText = Array.isArray(context.excludedIds) && context.excludedIds.length > 0
      ? `excludedIds=[${context.excludedIds.join(', ')}]`
      : 'excludedIds=[]';
    const clause = [kpText, diffText, `题目内容不得与以下已出题重复：${excludedText}`].filter(Boolean).join('；') + '。';
    userLines.push(`风格延续上一道题，${clause}`);
  }

  return { system, user: userLines.join('\n') };
}

export default buildPrompt;