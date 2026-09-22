// 四层校验服务（docs/DATA_SCHEMA.md §4.2 校验规则）
// ① JSON 层：剥取首个 JSON 块（兼容 ```json 围栏）+ JSON.parse
// ② 结构层：GenerateResponse 关键字段存在、questions 为非空数组
// ③ 逐题字段层：question/options(A-D 四键)/answer/analysis/knowledgePoint
// ④ 一致性层：answer 指向的选项文本非空 + B1 强化启发式（选项重复/近似、解析-答案一致性，见 checkConsistency）
// 轻微修复：answer 首尾空白与大小写归一（" c " → "C"）、字段 trim、options 多余键剔除；
// 修复后重新校验，仍不过则该题剔除（errors 记录），好题保留。

/** 判定一个题目是否通过字段层校验（返回 errors 与 warnings） */
function _checkQuestion(q) {
  const errors = [];
  const warnings = [];

  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    errors.push('题目不是对象');
    return { errors, warnings };
  }
  if (typeof q.question !== 'string' || !q.question.trim()) {
    errors.push('题干缺失或为空');
  }
  if (!q.options || typeof q.options !== 'object' || Array.isArray(q.options)) {
    errors.push('options 缺失或不是对象');
  } else {
    const keys = Object.keys(q.options);
    if (keys.length !== 4 || !['A', 'B', 'C', 'D'].every((key) => keys.includes(key))) {
      errors.push('options 必须恰为 A/B/C/D 四键');
    }
    for (const key of ['A', 'B', 'C', 'D']) {
      if (!(key in q.options) || typeof q.options[key] !== 'string' || !q.options[key].trim()) {
        errors.push(`选项 ${key} 缺失或为空`);
        break;
      }
    }
  }
  if (typeof q.answer !== 'string' || !['A', 'B', 'C', 'D'].includes(q.answer)) {
    errors.push('answer 必须为 A/B/C/D');
  } else if (q.options && typeof q.options === 'object' && !(q.answer in q.options)) {
    errors.push('answer 与 options 键不一致');
  }
  if (typeof q.analysis !== 'string' || !q.analysis.trim()) {
    errors.push('解析缺失或为空');
  }
  // knowledgePoint 可缺省（§4.1 推荐字段）：缺失仅标记 warning
  if (
    q.knowledgePoint === undefined || q.knowledgePoint === null ||
    typeof q.knowledgePoint !== 'string' || !q.knowledgePoint.trim()
  ) {
    warnings.push('缺少 knowledgePoint（可缺省，已标记；建议后端回填模块默认知识点）');
  }

  // ④ 一致性层 B1 强化（checkConsistency）：
  // errors（选项重复 / 解析声明与 answer 冲突）参与整组 ok 判定与重生成；
  // warnings（选项近似）汇入现有 warnings 列表，仅提示复核、不拒收。
  const consistency = checkConsistency(q);
  errors.push(...consistency.errors);
  warnings.push(...consistency.warnings);
  return { errors, warnings };
}

// ---- B1 强化：一致性层启发式（纯函数，供导出与 _checkQuestion 复用） ----

/** 选项文本归一化：去首尾空白 + 去常见标点（保留数字/单位/运算符等语义字符） */
function _normalizeOption(text) {
  return String(text ?? '').trim().replace(/[\s,，。、；：！？!?;:"'“”‘’「」『』（）()【】\[\]《》〈〉…—·・]/g, '');
}

/**
 * 一致性层强化检查（B1）：对修复后的题目对象做语义级粗检。
 * 规则 a（选项相似度）：选项归一化后完全相同 → error「内容重复」；
 *   一条是另一条的超长子串，且短串长度 ≥4 字、长度比 ≥0.6 → warning「相似，请复核」。
 * 规则 b（解析-答案一致性）：从 analysis 提取「选 X」或「答案[：为是]?X」声明，
 *   提取到的选项与 q.answer 不同 → error「解析声明的答案 X 与 answer=Y 不一致」。
 * @param {object} q 修复后的题目对象
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkConsistency(q) {
  const errors = [];
  const warnings = [];
  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    return { errors, warnings };
  }

  // (a) 选项相似度：按 A<B<C<D 成对比较
  const options = q.options;
  const keys = ['A', 'B', 'C', 'D'];
  if (options && typeof options === 'object' && keys.every((k) => typeof options[k] === 'string')) {
    const norm = {};
    for (const k of keys) norm[k] = _normalizeOption(options[k]);
    for (let i = 0; i < keys.length - 1; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const x = keys[i];
        const y = keys[j];
        // 归一化后完全相同 → 内容重复（误伤面最小：仅限实质相同的选项）
        if (norm[x] !== '' && norm[x] === norm[y]) {
          errors.push(`选项 ${x} 与选项 ${y} 内容重复`);
          continue;
        }
        // 超长子串近似：短串是长串的子串，且短串长度 ≥4 字、长度比 ≥0.6
        const short = norm[x].length <= norm[y].length ? norm[x] : norm[y];
        const long = norm[x].length <= norm[y].length ? norm[y] : norm[x];
        if (short.length >= 4 && long.includes(short) && short.length / long.length >= 0.6) {
          warnings.push(`选项 ${x} 与选项 ${y} 相似，请复核`);
        }
      }
    }
  }

  // (b) 解析-答案一致性：仅对字段层合法的 answer/analysis 生效
  if (
    typeof q.answer === 'string' && ['A', 'B', 'C', 'D'].includes(q.answer) &&
    typeof q.analysis === 'string' && q.analysis.trim()
  ) {
    const m = q.analysis.match(/(?:选(?:择)?\s*([A-Da-d])|答案[：:为是]?\s*([A-Da-d]))/);
    const declared = m ? (m[1] || m[2]) : null;
    if (declared) {
      const upper = declared.toUpperCase();
      if (upper !== q.answer) {
        errors.push(`解析声明的答案 ${upper} 与 answer=${q.answer} 不一致`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * 单题轻微修复（供复用）：trim 全部字符串字段、answer 大小写归一（"c " → "C"）、
 * options 剔除 A/B/C/D 之外的冗余键；任何致命结构问题（option 缺键等）返回 null。
 * @param {object} q 原始题目对象（不修改入参）
 * @returns {object|null} 修复后的题目对象，或 null（无法修复）
 */
export function repairQuestion(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;

  const out = { ...q };
  if (typeof out.question === 'string') out.question = out.question.trim();
  if (typeof out.analysis === 'string') out.analysis = out.analysis.trim();
  if (typeof out.knowledgePoint === 'string') out.knowledgePoint = out.knowledgePoint.trim();

  if (!out.options || typeof out.options !== 'object' || Array.isArray(out.options)) return null;
  const cleanOptions = {};
  for (const key of ['A', 'B', 'C', 'D']) {
    // 缺键或值为非字符串 → 缺内容无法凭空修补，判不可修复
    if (!(key in out.options) || typeof out.options[key] !== 'string') return null;
    cleanOptions[key] = out.options[key].trim();
  }
  out.options = cleanOptions;

  // answer：trim + 大小写归一
  if (typeof out.answer !== 'string' || !out.answer.trim()) return null;
  out.answer = out.answer.trim().toUpperCase();

  return out;
}

/** 逐题处理：先修复、再校验；坏题剔除（附原始错误），好题返回修复后的版本 */
function _processQuestion(q, index) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    return { question: null, errors: [`第${index + 1}题：题目不是对象`], warnings: [] };
  }

  const fixed = repairQuestion(q);
  if (!fixed) {
    const why = _checkQuestion(q).errors.join('；') || '结构无法修复';
    return { question: null, errors: [`第${index + 1}题：${why}`], warnings: [] };
  }

  const result = _checkQuestion(fixed);
  if (result.errors.length > 0) {
    return { question: null, errors: [`第${index + 1}题：${result.errors.join('；')}`], warnings: [] };
  }
  return { question: fixed, errors: [], warnings: result.warnings.map((w) => `第${index + 1}题：${w}`) };
}

/** 从模型原始输出中剥取首个 JSON 块（兼容 ```json 围栏与前后杂讯） */
function _extractJsonText(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  // 剥 ````json` 开头与结尾的 ```，再做整体截断兜底
  text = text.replace(/^```(?:json)?\s*/i, '');
  text = text.replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * 校验已解析的 GenerateResponse 对象
 * @param {object} payload 已 JSON.parse 的对象
 * @returns {{ok:boolean, questions:object[], errors:string[], warnings:string[]}}
 */
export function validateQuestions(payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, questions: [], errors: ['模型输出不是合法 JSON 对象'], warnings: [] };
  }

  // ② 结构层：GenerateResponse 关键字段存在、questions 为非空数组
  for (const key of ['exam', 'subject', 'module', 'difficulty']) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      errors.push(`结构错误：缺少必要字段 ${key}`);
    }
  }
  if (!Array.isArray(payload.questions)) {
    errors.push('结构错误：questions 缺失或不是数组');
    return { ok: false, questions: [], errors, warnings };
  }
  if (payload.questions.length === 0) {
    errors.push('结构错误：questions 为空数组');
    return { ok: false, questions: [], errors, warnings };
  }

  // ③④ 逐题字段层 + 一致性层
  const questions = [];
  for (let i = 0; i < payload.questions.length; i += 1) {
    const { question, errors: qErrors, warnings: qWarnings } = _processQuestion(payload.questions[i], i);
    if (question) {
      questions.push(question);
      warnings.push(...qWarnings);
    } else {
      errors.push(...qErrors);
    }
  }

  // 结构错误或好题为空 → 整组不可用
  const ok = errors.length === 0 && questions.length > 0;
  if (questions.length === 0 && errors.length === 0) {
    errors.push('结构错误：通过逐题校验的题目数量为 0');
  }
  return { ok, questions, errors, warnings };
}

/**
 * 校验模型原始输出字符串（入口一：rawText）
 * @param {string} rawText 模型返回的原始文本（可能含 ```json 围栏）
 * @returns {{ok:boolean, questions:object[], errors:string[], warnings:string[]}}
 */
export function validateRaw(rawText) {
  const jsonText = _extractJsonText(rawText);
  if (jsonText === null) {
    return { ok: false, questions: [], errors: ['未在模型输出中找到 JSON 块'], warnings: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, questions: [], errors: [`JSON 解析失败：${err.message}`], warnings: [] };
  }
  return validateQuestions(parsed);
}

export default validateQuestions;