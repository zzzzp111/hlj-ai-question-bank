// questionBank.js —— 最新题库检索服务（function calling 数据源，Wave 9）
//
// 设计目标：buildPrompt 不再把"模块→知识点"表写死在提示词里（去硬编码）；
// LLM 通过 function calling 调用本服务的 search_question_bank 工具，
// 动态检索题库素材（最新真题/模拟题），再基于素材命制原创改编题。
//
// 数据源双轨（与 C4 Mock 双轨同构的"本地种子兜底"）：
//   ① 远程：配置 QUESTION_BANK_API_URL 时优先联网检索（GET ?module=&difficulty=&topic=&limit=，
//      响应为 { items:[Question素材] } 或 [Question素材]）；超时 5s，任何异常静默回退本地种子。
//   ② 本地：内置种子题库（复用 mockData 的 mockBank 元数据：module/difficulty + §4 Question）。
// 远程未配置/失败 → 回退本地，保证无网无 Key 环境功能完整可演示。
//
// 素材含 answer/analysis：仅服务端发给 LLM 参考（C2 渲染层剥离约束不涉及服务端内部）。

import { mockBank } from './mockData.js';
import { env } from '../config/env.js';
import { MODULE_WHITELIST } from './parseRequirement.js';

const REMOTE_TIMEOUT_MS = 5_000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/** function calling 工具定义（OpenAI 兼容 tools 数组元素） */
export const QUESTION_BANK_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'search_question_bank',
    description:
      '检索行测题库素材（最新真题/模拟题），返回带知识点与答案解析的题目条目，供命制原创改编题使用。' +
      '按模块必传，可按难度/知识点主题/数量过滤。',
    parameters: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: [...MODULE_WHITELIST],
          description: '行测模块，必填，取值见枚举',
        },
        difficulty: {
          type: 'string',
          enum: ['简单', '中等', '困难'],
          description: '难度过滤，可选',
        },
        topic: {
          type: 'string',
          description: '知识点/主题关键词（在题干、知识点、解析中模糊匹配），可选',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `返回条数上限，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`,
        },
      },
      required: ['module'],
    },
  },
});

export const QUESTION_BANK_TOOLS = Object.freeze([QUESTION_BANK_TOOL]);

/** 校验单条素材是否符合 Question 素材结构（远程数据归一化用） */
function _isValidItem(it) {
  if (!it || typeof it !== 'object') return false;
  if (typeof it.question !== 'string' || !it.question.trim()) return false;
  if (typeof it.knowledgePoint !== 'string' || !it.knowledgePoint.trim()) return false;
  const keys = typeof it.options === 'object' ? Object.keys(it.options) : [];
  if (!['A', 'B', 'C', 'D'].every((k) => keys.includes(k))) return false;
  if (!['A', 'B', 'C', 'D'].includes(it.answer)) return false;
  return true;
}

/** 归一化远程数据 → 本地素材同构结构（非法条目丢弃） */
function _normalizeRemote(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (!_isValidItem(it)) continue;
    out.push({
      id: String(it.id ?? `remote_${i + 1}`),
      module: it.module || '',
      difficulty: it.difficulty || '',
      question: String(it.question).trim(),
      options: { A: it.options.A, B: it.options.B, C: it.options.C, D: it.options.D },
      answer: it.answer,
      analysis: typeof it.analysis === 'string' ? it.analysis : '',
      knowledgePoint: String(it.knowledgePoint).trim(),
    });
  }
  return out;
}

/** 远程检索（未配置/失败/超时 → 返回 null，由上层回退本地种子） */
async function _fetchRemote(query) {
  const base = (env.questionBankApiUrl || '').trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items) return null;
    const normalized = _normalizeRemote(items);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null; // 网络/超时/解析异常一律回退本地
  }
}

/** 本地种子检索（按 模块/难度/主题关键词 过滤 + limit 截断）；素材含 module/difficulty 元数据（与远程归一化结构同构） */
function _searchLocal({ module, difficulty, topic, limit }) {
  const hay = topic ? topic.trim() : '';
  return mockBank
    .filter((entry) => (module ? entry.module === module : true))
    .filter((entry) => (difficulty ? entry.difficulty === difficulty : true))
    .filter((entry) => {
      if (!hay) return true;
      const q = entry.question;
      return `${q.question} ${q.knowledgePoint} ${q.analysis}`.includes(hay);
    })
    .slice(0, limit)
    .map((entry) => ({
      id: entry.question.id,
      module: entry.module,
      difficulty: entry.difficulty,
      question: entry.question.question,
      options: { ...entry.question.options },
      answer: entry.question.answer,
      analysis: entry.question.analysis,
      knowledgePoint: entry.question.knowledgePoint,
    }));
}

/**
 * 题库检索入口（tool 执行器与验证脚本共用）
 * @param {{module?:string, difficulty?:string, topic?:string, limit?:number}} args
 * @returns {Promise<{ok:boolean, source:'local'|'remote', query:object, total:number, items:object[],
 *                    error?:string}>}
 */
export async function searchQuestionBank(args = {}) {
  const module = typeof args.module === 'string' ? args.module : '';
  const difficulty = typeof args.difficulty === 'string' ? args.difficulty : '';
  const topic = typeof args.topic === 'string' ? args.topic : '';
  const limitRaw = Number(args.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (module && !MODULE_WHITELIST.includes(module)) {
    return { ok: false, source: 'local', query: { module, difficulty, topic, limit }, total: 0, items: [], error: `非法模块「${module}」` };
  }

  let items = null;
  let source = 'local';
  const remote = await _fetchRemote({ module: module || undefined, difficulty: difficulty || undefined, topic: topic || undefined, limit });
  if (remote) {
    items = remote;
    source = 'remote';
  } else {
    items = _searchLocal({ module, difficulty, topic, limit });
  }

  return {
    ok: true,
    source,
    query: { module, difficulty, topic, limit },
    total: items.length,
    items,
  };
}

export default searchQuestionBank;