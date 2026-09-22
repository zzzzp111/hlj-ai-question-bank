// 环境变量读取与校验（AGENTS.md C1：Key 仅存在于 server/.env，不进代码/前端）
import 'dotenv/config';

// 缺省默认值：PORT=3001；LLM 相关变量未配置时为空字符串，不视为错误
// （空 Key 由 callLLM.js 在 Wave 2 判定为 Mock 模式，见 C4 Mock 双轨）
const DEFAULT_PORT = 3001;

function _toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** 从 .env 读取并归一化后的环境变量 */
export const env = {
  port: _toInt(process.env.PORT, DEFAULT_PORT),
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmBaseUrl: process.env.LLM_BASE_URL ?? '',
  llmModel: process.env.LLM_MODEL ?? '',
  // LLM 调用超时（毫秒，P1-1 可配置）：推理模型题量越大越慢，count=10 实测约 24s，
  // 如遇偶发超时可将 LLM_TIMEOUT_MS 调大（如 60000）。非法值回落默认 30000。
  llmTimeoutMs: _toInt(process.env.LLM_TIMEOUT_MS, 30000),
  // 可选：请求体 max_tokens（P1-2）。缺省不写入请求体，保持既有行为；
  // 配置正整数后写入，避免推理模型因 reasoning 吃满 token 导致 content 为空。
  llmMaxTokens: _toInt(process.env.LLM_MAX_TOKENS, 0),
  // 远程题库 API（function calling 数据源，可插拔）：未配置时 searchQuestionBank 回退本地种子题库
  questionBankApiUrl: process.env.QUESTION_BANK_API_URL ?? '',
  // 推理强度（none/low/medium/high，透传为请求体 reasoning_effort；非枚举值由 callLLM 忽略；Wave 11）
  llmReasoningEffort: process.env.LLM_REASONING_EFFORT ?? '',
  // CORS 白名单（P1-5）：未配置时保持宽松（cors() 全开，保证开发/演示零配置可用）；
  // 配置后仅接受逗号分隔的白名单来源。生产同源托管（方案 A）无需配置。
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  // 请求体大小上限（P1-5）：默认 1mb，非法/为空回落默认
  bodyLimit: process.env.BODY_LIMIT || '1mb',
};

export default env;