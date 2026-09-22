// POST /api/generate —— 核心出题闭环（Wave 2）
// 七步组装（对应 AGENTS.md C4 与 docs/DATA_SCHEMA.md §3）：
//   ① parseRequirement（body 显式字段 overrides 优先于 NL 解析）
//   ② buildPrompt（params + context 透传）
//   ③ callLLM（统一封装，30s 超时 + 重试 1 次；异常 → Mock 兜底）
//   ④ validateRaw（四层校验；失败反馈重新生成 ≤2 次）
//   ⑤ 仍失败 → getMockQuestions 兜底，mock:true
//   ⑥ 校验通过 → 做真实链路，mock:false
//   ⑦ 组装 GenerateResponse（id 全局唯一重生成）返回
// 响应始终是合法 GenerateResponse；任何异常不返回非结构化文本。

import { Router } from 'express';
import { randomUUID } from 'node:crypto';

import { parseRequirement, MODULE_WHITELIST } from '../services/parseRequirement.js';
import { buildPrompt } from '../services/buildPrompt.js';
import { callLLM } from '../services/callLLM.js';
import { validateRaw } from '../services/validateQuestions.js';
import { getMockQuestions, shuffleOptions } from '../services/mockData.js';
import { QUESTION_BANK_TOOLS, searchQuestionBank } from '../services/questionBank.js';
import { env } from '../config/env.js';

const router = Router();

/** count 合法区间（DATA_SCHEMA §2.4：1~10 整数） */
const COUNT_MIN = 1;
const COUNT_MAX = 10;

/**
 * 显式字段合法性校验（REGRESSION R1/R2）：
 * body 显式携带的 module 必须在白名单、count 必须是 1~10 整数；
 * 非法即 400（统一错误结构），不再静默回落默认值（parseRequirement 的回落仅针对"未显式指定"）。
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function _validateExplicitOverrides(body) {
  if (body.module !== undefined && !MODULE_WHITELIST.includes(body.module)) {
    return {
      ok: false,
      message: `module「${body.module}」不合法，应为：${MODULE_WHITELIST.join(' / ')}`,
    };
  }
  if (body.count !== undefined) {
    const n = Number(body.count);
    if (!Number.isInteger(n) || n < COUNT_MIN || n > COUNT_MAX) {
      return { ok: false, message: `count「${body.count}」不合法，应为 ${COUNT_MIN}~${COUNT_MAX} 的整数` };
    }
  }
  return { ok: true };
}

/** 可被表单显式覆盖并传入 parseRequirement 的字段（仅当 body 中显式存在时传） */
const OVERRIDE_KEYS = ['exam', 'subject', 'module', 'difficulty', 'count'];

/** 从 body 提取显式字段 overrides（undefined 不参与覆盖 NL 解析结果） */
function _pickOverrides(body) {
  const overrides = {};
  for (const key of OVERRIDE_KEYS) {
    if (body[key] !== undefined) overrides[key] = body[key];
  }
  return overrides;
}

/** 生成全局唯一题目 id：q_<uuid 前 6 位>（context 透传时不用 mock_ 前缀，见 C2.2 任务 2） */
function _genQuestionId() {
  return `q_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

/**
 * Mock 兜底取题：优先按 module+difficulty 筛选；命中不足 count 时，
 * 回退模块全量池补足（保证响应题量 = count 的语义，见 DATA_SCHEMA §3.1；
 * Mock 各难度库存有限，此为演示可接受的近似——难度字段仍取请求难度）。
 * Wave 10 随机化：getMockQuestions 已随机抽样；此处再逐题 shuffleOptions
 * （选项乱序 + 同步 answer/解析声明），使同一参数每次请求返回的"题目+选项排列"
 * 均不同，消除"固定题库"观感（真实 LLM 链路每次输出天然随机，不做洗牌）。
 */
function _mockQuestions(params) {
  const need = params.count;
  const filtered = getMockQuestions({ module: params.module, difficulty: params.difficulty, count: need });
  let picked;
  if (filtered.length >= need) {
    picked = filtered;
  } else {
    const pool = getMockQuestions({ module: params.module }).filter(
      (q) => !filtered.some((fq) => fq.id === q.id)
    );
    picked = filtered.concat(pool).slice(0, need);
  }
  return picked.map(shuffleOptions);
}

/** 组装 OpenAI 消息数组；extra 为可选的重生成反馈文本（追加到 user 消息末尾） */
function _messages(prompt, extra = '') {
  const user = extra
    ? `${prompt.user}\n\n—— 上一次生成的校验反馈（请严格按要求修正后仅重新输出 JSON）：\n${extra}`
    : prompt.user;
  return [
    { role: 'system', content: prompt.system },
    { role: 'user', content: user },
  ];
}

/**
 * function calling 工具执行器（Wave 9）：把模型侧 tool_calls 路由到本地实现。
 * 题库检索由 searchQuestionBank 承担；未知工具返回结构化错误（callLLM 会回填给模型）。
 * @param {string} name 工具名
 * @param {object} args 参数
 * @returns {Promise<object>} JSON 可序列化结果
 */
async function _toolExecutor(name, args) {
  if (name === 'search_question_bank') {
    return searchQuestionBank((args && typeof args === 'object') ? args : {});
  }
  return { ok: false, error: `未知工具：${name}` };
}

router.post('/', async (req, res) => {
  // 请求体容错：非法体按空体处理（空体走默认值，不报错，见 DATA_SCHEMA §2.4）
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? body.context
    : null;

  // ① 显式字段合法性：非法 module/count 直接 400（REGRESSION R1/R2），合法才进入解析
  const explicitCheck = _validateExplicitOverrides(body);
  if (!explicitCheck.ok) {
    res.status(400).json({ error: { code: 400, message: explicitCheck.message } });
    return;
  }

  // ② 参数解析：显式表单字段 > NL 解析结果 > 默认值（DATA_SCHEMA §2.4）
  const params = parseRequirement(body.requirement, _pickOverrides(body));
  if (context) params.context = context;

  // ② Prompt 组装（params.context 存在时 buildPrompt 自动追加"风格延续、命题不重复"）
  const prompt = buildPrompt(params);

  let mock = true; // 默认 Mock 兜底；真实链路全部通过后才改为 false
  let questions = [];
  let mockReason = ''; // P1-1：Mock 兜底原因（可选诊断字段，仅 mock:true 时附带；如 TIMEOUT / NO_KEY / VALIDATION_FAILED / EMPTY_CONTENT / HTTP）

  try {
    // ③ 首次调用模型（Wave 9：携带 function calling 工具；Wave 11：透传推理强度）
    //    P1-1：显式传入可配置超时（LLM_TIMEOUT_MS），避免 30s 硬编码与推理模型耗时撞线静默降级
    let raw = await callLLM(_messages(prompt), {
      tools: QUESTION_BANK_TOOLS,
      toolExecutor: _toolExecutor,
      reasoningEffort: env.llmReasoningEffort || undefined,
      timeoutMs: env.llmTimeoutMs,
    });
    // ④ 四层校验；失败反馈重新生成 ≤2 次（把上次错误信息追加进提示词）
    let validated = validateRaw(raw);
    for (let attempt = 0; attempt < 2 && !validated.ok; attempt += 1) {
      raw = await callLLM(_messages(prompt, validated.errors.join('；')), {
        tools: QUESTION_BANK_TOOLS,
        toolExecutor: _toolExecutor,
        reasoningEffort: env.llmReasoningEffort || undefined,
        timeoutMs: env.llmTimeoutMs,
      });
      validated = validateRaw(raw);
    }

    if (validated.ok) {
      // ⑥ 校验通过：走真实链路（mock:false）
      mock = false;
      questions = validated.questions.slice(0, params.count);
    } else {
      // ⑤ 校验最终失败 → Mock 兜底（mock:true）
      console.error(`[generate] 模型输出校验失败（${validated.errors.length} 处），回退 Mock：${validated.errors.join('；')}`);
      mockReason = 'VALIDATION_FAILED';
      questions = _mockQuestions(params);
    }
  } catch (err) {
    // 任何异常（callLLM 抛错：无 Key/超时/HTTP/网络/EMPTY_CONTENT，或未知异常）→ Mock 兜底 mock:true（C4）
    // 仅记录错误 message，不含 Key（callLLM 的 message 从不携带 Key 内容）
    // P1-1：把错误分类同步到 mockReason，使"静默降级"对调用方可见
    mockReason = ['NO_KEY', 'TIMEOUT', 'HTTP', 'NETWORK', 'EMPTY_CONTENT'].includes(err?.kind) ? err.kind : 'CALL_FAILED';
    console.error(`[generate] 模型链路异常（${err?.kind ?? 'UNKNOWN'}），回退 Mock：${err?.message ?? err}`);
    questions = _mockQuestions(params);
  }

  // B2：硬去重——context.excludedQuestions 为题干文本数组，过滤掉已出过的题
  // （置于取样与截断之后、id 重生成之前；context 可能为 null，用可选链访问）
  if (Array.isArray(context?.excludedQuestions) && context.excludedQuestions.length > 0) {
    const fullList = questions; // 过滤前的完整原列表（防空响应回退时用，不能用截断后的）
    const excluded = new Set(context.excludedQuestions.map((t) => String(t).trim()));
    const before = fullList.length;
    questions = fullList.filter((q) => !excluded.has(String(q.question).trim()));
    // 防空响应违反 GenerateResponse 契约：过滤后为空则保留原列表并告警
    if (questions.length === 0) {
      console.warn('[generate] excludedQuestions 过滤后为空，保留原题列表');
      questions = fullList;
    } else if (questions.length < before) {
      console.log(`[generate] excludedQuestions 过滤掉 ${before - questions.length} 题`);
    }
  }

  // ⑦ 校验通过后对每题 id 重新生成，保证全局唯一（含 Mock 兜底路径，context 场景不用 mock_ 前缀）
  questions = questions.map((q) => ({ ...q, id: _genQuestionId() }));

  res.json({
    mock,
    // mockReason 为可选诊断字段（P1-1）：仅 mock:true 且存在明确原因时附带，便于前端提示与排查降级原因
    ...(mock && mockReason ? { mockReason } : {}),
    exam: params.exam,
    subject: params.subject,
    module: params.module,
    difficulty: params.difficulty,
    questions,
  });
});

export default router;