// 模型调用统一封装（AGENTS.md C4 Mock 双轨：所有 LLM 调用必须经此文件）
// OpenAI 兼容协议：POST {baseUrl}/chat/completions
// 超时 30s + 失败重试 1 次（指数退避 500ms）+ 统一错误分类：
//   err.kind = 'NO_KEY' | 'TIMEOUT' | 'HTTP' | 'NETWORK'
// 未配置 LLM_API_KEY 时立即抛 NO_KEY（不发起请求），由上层路由走 Mock 兜底。
// 安全约束：任何代码路径不得打印或抛出 Key 内容（Key 仅进入 Authorization 请求头）。
//
// Wave 9（function calling）：callLLM 支持 opts.tools（OpenAI 兼容 tools 数组）与
// opts.toolExecutor(name, args)。当模型返回 tool_calls 时，本服务执行工具并把结果以
// role:'tool' 消息回填，继续请求，直到模型给出最终 content（最多 MAX_TOOL_ROUNDS 轮往返）。

import { env } from '../config/env.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1; // 失败重试 1 次 = 最多 2 次尝试
const RETRY_DELAYS = [500]; // 指数退避序列：500ms（重试 1 次仅用到第一档；后续轮次可扩展 1000ms）
const MAX_TOOL_ROUNDS = 2; // tool_calls 往返上限（初始请求 + 最多 2 轮工具执行后必须产出最终内容）

/** 组装错误：附统一分类属性 err.kind（上层路由据此决定 Mock 兜底策略） */
function _makeError(message, kind) {
  const err = new Error(message);
  err.kind = kind;
  return err;
}

/** reasoning_effort 合法枚举（OpenAI o 系 / 部分推理模型支持） */
const REASONING_EFFORTS = ['none', 'low', 'medium', 'high'];

/**
 * 空 content 分类判定（P1-2，纯函数便于原子断言）：
 * 推理模型的 reasoning_content 会消耗 token，content 为空且 finish_reason='length' 时，
 * 属"输出被截断/耗尽"，非接口故障 → 独立分类 EMPTY_CONTENT（区别于 HTTP）。
 * @param {string} content 模型 message.content
 * @param {object[]} toolCalls message.tool_calls
 * @param {string|undefined} finishReason choices[0].finish_reason
 * @returns {string|null} 命中返回分类字符串（'EMPTY_CONTENT'），否则 null（调用方按原 HTTP 处理）
 */
export function classifyEmptyContent(content, toolCalls, finishReason) {
  const hasContent = typeof content === 'string' && content.trim();
  const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
  if (hasContent || hasToolCalls) return null;
  return finishReason === 'length' ? 'EMPTY_CONTENT' : null;
}

/**
 * 组装 /chat/completions 请求体（纯函数，便于原子断言；Wave 11 导出）
 * @param {string} model 模型名
 * @param {object[]} messages OpenAI 消息数组
 * @param {object[]|undefined} tools OpenAI 兼容 tools（缺省/空不写）
 * @param {string|undefined} reasoningEffort none/low/medium/high（非枚举值忽略）
 * @param {number|undefined} maxTokens 可选 max_tokens（正整数才写入；缺省不写，保持既有行为；P1-2）
 * @returns {object} 请求体
 */
export function buildChatBody(model, messages, tools, reasoningEffort, maxTokens) {
  const body = { model, messages, temperature: 0.7 };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (typeof reasoningEffort === 'string' && REASONING_EFFORTS.includes(reasoningEffort)) {
    body.reasoning_effort = reasoningEffort;
  }
  if (Number.isInteger(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

/**
 * 单次请求（不含重试）
 * @param {{baseUrl:string, apiKey:string, model:string, messages:object[],
 *          tools?:object[], maxTokens?:number, signal:AbortSignal}} opts
 * @returns {Promise<{content:string, toolCalls:object[]}>} 模型 message 的 content 与 tool_calls（可为空）
 */
async function _fetchOnce({ baseUrl, apiKey, model, messages, tools, reasoningEffort, maxTokens, signal }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = buildChatBody(model, messages, tools, reasoningEffort, maxTokens);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const httpErr = _makeError(`模型接口返回 HTTP ${resp.status}`, 'HTTP');
    httpErr.status = resp.status;
    throw httpErr;
  }

  const data = await resp.json();
  const message = data?.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  // P1-2：推理模型的 reasoning_content 会"吃掉"token，content 可能为空（finish_reason='length'）。
  // classifyEmptyContent 判定为 EMPTY_CONTENT（非接口故障），避免日志把人引向 HTTP/网络排查。
  const emptyKind = classifyEmptyContent(content, toolCalls, data?.choices?.[0]?.finish_reason);
  if (emptyKind === 'EMPTY_CONTENT') {
    throw _makeError('模型输出被截断或全部消耗于推理过程（content 为空，finish_reason=length）', 'EMPTY_CONTENT');
  }
  if (!content.trim() && toolCalls.length === 0) {
    throw _makeError('模型响应缺少 message.content 且无 tool_calls', 'HTTP');
  }
  return { content, toolCalls };
}

/**
 * 一轮完整会话（初始请求 + tool_calls 往返循环）；不做重试（重试由 callLLM 外层负责）
 * @returns {Promise<{content:string}>} 最终 message.content（此时不再有未处理的 tool_calls）
 */
async function _runSession({ baseUrl, apiKey, model, messages, tools, toolExecutor, reasoningEffort, maxTokens, timeoutMs }) {
  let roundMessages = Array.isArray(messages) ? messages.slice() : [];
  const hasTools = Array.isArray(tools) && tools.length > 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let outcome;
    try {
      outcome = await _fetchOnce({
        baseUrl,
        apiKey,
        model,
        messages: roundMessages,
        tools: hasTools ? tools : undefined,
        reasoningEffort,
        maxTokens,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const { content, toolCalls } = outcome;
    if (!hasTools || toolCalls.length === 0) {
      // 无工具场景或模型已给出最终答案：content 非空（_fetchOnce 已保证非空或抛错）
      return { content };
    }
    if (round >= MAX_TOOL_ROUNDS) {
      // 工具往返已达上限仍未产出最终内容：把累积文本返回，空则抛错（由上层走 Mock 兜底）
      if (content.trim()) return { content };
      throw _makeError('工具调用轮数超限且模型未产出最终内容', 'HTTP');
    }

    // 把 assistant 的 tool_calls 回填（content 可能为空字符串，OpenAI 协议允许）
    roundMessages.push({ role: 'assistant', content, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc?.function?.name || '';
      let args = {};
      if (tc?.function?.arguments) {
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
      }
      let result;
      if (name && typeof toolExecutor === 'function') {
        try {
          result = await toolExecutor(name, args);
        } catch (err) {
          result = { ok: false, error: `工具执行异常：${err?.message ?? err}` };
        }
      } else {
        result = { ok: false, error: `未知工具或未配置执行器：${name}` };
      }
      roundMessages.push({
        role: 'tool',
        tool_call_id: tc.id || '',
        content: JSON.stringify(result),
      });
    }
  }
  // 不可达（for 循环必 return/throw）
  throw _makeError('工具会话异常终止', 'HTTP');
}

/**
 * 调用 LLM（唯一入口；上层一律走本函数，禁止散落真实 API 调用）
 * @param {{role:string, content:string}[]} messages 符合 OpenAI 消息格式
 * @param {{model?:string, baseUrl?:string, timeoutMs?:number, maxRetries?:number,
 *          tools?:object[], toolExecutor?:Function, reasoningEffort?:string}} [opts]
 *         tools：OpenAI 兼容函数定义数组；toolExecutor：执行器 (name, args) => Promise<object>；
 *         reasoningEffort：推理强度 none/low/medium/high（供 o 系/推理模型）,非枚举值忽略
 * @returns {Promise<string>} message.content 字符串（工具场景为最终轮次产出）
 * @throws {Error} err.kind: 'NO_KEY' | 'TIMEOUT' | 'HTTP' | 'NETWORK'
 */
export async function callLLM(messages, opts = {}) {
  const apiKey = env.llmApiKey;
  if (!apiKey) {
    // 未配置 Key：立即抛错供上层走 Mock（C4），不发起任何网络请求
    throw _makeError('未配置 LLM_API_KEY，自动进入 Mock 模式', 'NO_KEY');
  }

  const baseUrl = (opts.baseUrl ?? env.llmBaseUrl ?? '').trim() || DEFAULT_BASE_URL;
  const model = (opts.model ?? env.llmModel ?? '').trim() || DEFAULT_MODEL;
  const timeoutMs = Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0
    ? opts.timeoutMs
    : (Number.isInteger(env.llmTimeoutMs) && env.llmTimeoutMs > 0 ? env.llmTimeoutMs : DEFAULT_TIMEOUT_MS);
  const maxTokens = (Number.isInteger(opts.maxTokens) && opts.maxTokens > 0)
    ? opts.maxTokens
    : (Number.isInteger(env.llmMaxTokens) && env.llmMaxTokens > 0 ? env.llmMaxTokens : undefined);
  const maxRetries = Number.isInteger(opts.maxRetries) ? opts.maxRetries : MAX_RETRIES;

  const normalizedMessages = Array.isArray(messages) ? messages : [];

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const { content } = await _runSession({
        baseUrl,
        apiKey,
        model,
        messages: normalizedMessages,
        tools: opts.tools,
        toolExecutor: opts.toolExecutor,
        reasoningEffort: opts.reasoningEffort,
        maxTokens,
        timeoutMs,
      });
      return content;
    } catch (err) {
      // 分类：fetch 主动 abort → 超时；TypeError/未知 → 网络；其余沿用内部已分类的 kind
      let kind = err?.kind;
      if (!kind) {
        if (err?.name === 'AbortError') kind = 'TIMEOUT';
        else kind = 'NETWORK';
      }
      lastErr = err instanceof Error ? err : _makeError(String(err), kind);
      lastErr.kind = kind;

      const isRetryable = kind !== 'NO_KEY'; // NO_KEY 重试无意义，其余（超时/HTTP/网络）重试 1 次
      if (attempt < maxRetries && isRetryable) {
        const delay = RETRY_DELAYS[attempt] ?? 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }

  throw lastErr;
}

export default callLLM;