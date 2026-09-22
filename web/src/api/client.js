// client.js —— 前端唯一后端访问入口（AGENTS.md §4：禁止在组件内拼 fetch URL）
// 成功：resolve 解析后的响应体（统一 Schema，见 docs/DATA_SCHEMA.md，C3）；
// 失败：resolve { error: { code, message } }（与后端统一错误格式一致，见 docs/API.md §2）。
// 注意：本模块只做传输与错误归一化，不触碰任何业务字段；Key 不存在于前端（C1）。

const DEFAULT_TIMEOUT_MS = 30000

// 网络层错误（断网 / 后端停 / 请求超时 / 响应非 JSON 等）
const NETWORK_ERROR = { error: { code: 503, message: '网络异常，请检查网络或稍后重试' } }

// 归一化非 2xx：尝试解析后端统一错误体 { error: { code, message } }
// 解析失败（网关错误页 / 无 body / 非 JSON / 未按统一格式）→ 网络异常 503（REGRESSION R4）：
//   后端代理 502 空 body 等场景即落此分支，统一提示"网络异常"而非误导性的"未知错误"
function _normalizeHttpError(body) {
  if (body && body.error && typeof body.error.code !== 'undefined' && typeof body.error.message === 'string') {
    return { error: { code: body.error.code, message: body.error.message } }
  }
  return NETWORK_ERROR
}

// fetch 封装：AbortController + 定时器实现超时中断
function _fetchWithTimeout(path, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(path, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * POST JSON 请求（如 /api/generate、/api/explain）
 * @param {string} path 以 /api 开头的接口路径
 * @param {object} body 请求体（GenerateRequest 等，见 docs/DATA_SCHEMA.md）
 * @param {number} [timeoutMs=30000] 超时毫秒数
 * @returns {Promise<object>} 成功返回响应 JSON；失败返回 { error: { code, message } }
 */
export async function postJSON(path, body = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const res = await _fetchWithTimeout(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      timeoutMs
    )
    // 响应体可能不是合法 JSON（如网关错误页），统一兜底
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return _normalizeHttpError(data)
    }
    return data
  } catch (err) {
    // 网络中断 / 超时（AbortError）/ 其它异常
    return NETWORK_ERROR
  }
}

/**
 * GET JSON 请求（供 /api/health 存活探测使用）
 * @param {string} path 以 /api 开头的接口路径
 * @param {number} [timeoutMs=30000] 超时毫秒数
 * @returns {Promise<object>} 成功返回响应 JSON；失败返回 { error: { code, message } }
 */
export async function getJSON(path, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const res = await _fetchWithTimeout(
      path,
      {
        method: 'GET',
        headers: { Accept: 'application/json' }
      },
      timeoutMs
    )
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return _normalizeHttpError(data)
    }
    return data
  } catch (err) {
    return NETWORK_ERROR
  }
}