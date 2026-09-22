// 需求解析服务（NL → 结构化出题配置）
// 对应 docs/DATA_SCHEMA.md §2 GenerateRequest 与 AGENTS.md C3 统一 Schema。
// 解析优先级：表单显式字段（overrides） > 自然语言识别 > 默认值（DATA_SCHEMA §2.4）。
// 纯函数实现，不发起任何外部调用；路由层（C2.2）负责组装请求体。

/** 五大模块白名单（docs/DATA_SCHEMA.md §2.2） */
export const MODULE_WHITELIST = ['言语理解与表达', '判断推理', '数量关系', '资料分析', '常识判断'];

/** 缺省默认值（docs/DATA_SCHEMA.md §2.4） */
export const DEFAULT_CONFIG = Object.freeze({
  exam: '黑龙江省考',
  subject: '行测',
  module: '资料分析',
  difficulty: '中等',
  count: 3,
});

/** 模块别名表：别名 → 白名单模块（长别名在前，避免「常识判断」被「判断」误吞） */
const MODULE_ALIASES = [
  ['言语理解与表达', '言语理解与表达'],
  ['判断推理', '判断推理'],
  ['数量关系', '数量关系'],
  ['资料分析', '资料分析'],
  ['常识判断', '常识判断'],
  ['言语', '言语理解与表达'],
  ['判断', '判断推理'],
  ['数量', '数量关系'],
  ['资料', '资料分析'],
  ['资分', '资料分析'],
  ['常识', '常识判断'],
];

/** 别名 → 规范模块名（识别结果经此映射回白名单值） */
const MODULE_ALIAS_MAP = Object.fromEntries(MODULE_ALIASES);

/** 按别名长度降序组合成单条正则（同一位置先试长词） */
const MODULE_ALIAS_RE = new RegExp(
  MODULE_ALIASES.map(([alias]) => alias).sort((a, b) => b.length - a.length).join('|')
);

/** 知识点关键词表（文本中出现即收录，去重后按表顺序返回；找不到可为空数组） */
const KNOWLEDGE_KEYWORDS = [
  // 资料分析
  '增长率', '增长量', '比重', '平均数', '倍数', '基期', '现期', '同比', '环比',
  // 判断推理
  '定义判断', '类比推理', '逻辑判断', '图形推理',
  // 言语理解与表达
  '主旨概括', '意图判断', '逻辑填空', '语句排序',
  // 数量关系
  '工程问题', '行程问题', '排列组合', '数列',
  // 常识
  '常识',
];

/** 从候选值中取第一个非空字符串（用于「overrides > NL > 默认值」链式取值） */
function _pick(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

/**
 * 解析需求
 * @param {string} input 自然语言描述（可为空字符串）
 * @param {{exam?:string, subject?:string, module?:string, difficulty?:string, count?:number}} overrides 表单显式字段（可缺省）
 * @returns {{exam:string, subject:string, module:string, difficulty:string, count:number, knowledgePoints:string[]}}
 */
export function parseRequirement(input = '', overrides = {}) {
  const text = typeof input === 'string' ? input : '';
  const ov = overrides && typeof overrides === 'object' ? overrides : {};

  // 1) 自然语言识别（正则 + 别名表；地区/科目命中后归一到 Schema 规范值）
  const matchedExam = /黑龙江省|黑龙江|省考/.test(text) ? '黑龙江省考' : '';
  const matchedSubject = /行测|行政职业能力测验/.test(text) ? '行测' : '';
  const matchedAlias = MODULE_ALIAS_RE.exec(text)?.[0] ?? '';
  const matchedModule = MODULE_ALIAS_MAP[matchedAlias] ?? '';
  const matchedDifficulty = (text.match(/简单|中等|困难/) || [])[0];
  const countMatch = text.match(/(\d+)\s*(?:道|题)/);

  // 2) 知识点识别：扫描关键词表，保留文本中出现的点（表本身无重复）
  const knowledgePoints = KNOWLEDGE_KEYWORDS.filter((keyword) => text.includes(keyword));

  // 3) 优先级合并：overrides > NL > 默认值
  const result = {
    exam: _pick(ov.exam, matchedExam, DEFAULT_CONFIG.exam),
    subject: _pick(ov.subject, matchedSubject, DEFAULT_CONFIG.subject),
    module: _pick(ov.module, matchedModule, DEFAULT_CONFIG.module),
    difficulty: _pick(ov.difficulty, matchedDifficulty, DEFAULT_CONFIG.difficulty),
    count: DEFAULT_CONFIG.count,
    knowledgePoints,
  };

  // count：overrides 显式数字优先，其次 NL 题量，再次默认值
  if (ov.count !== undefined && Number.isFinite(Number(ov.count))) {
    result.count = Number.parseInt(ov.count, 10);
  } else if (countMatch) {
    result.count = Number.parseInt(countMatch[1], 10);
  }

  // 4) 归一化：module 白名单校验（非法回落默认模块）；count 截断到 1~10 整数
  if (!MODULE_WHITELIST.includes(result.module)) result.module = DEFAULT_CONFIG.module;
  if (!Number.isInteger(result.count)) result.count = DEFAULT_CONFIG.count;
  result.count = Math.min(10, Math.max(1, result.count));

  return result;
}

export default parseRequirement;