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
  // 远程题库 API（function calling 数据源，可插拔）：未配置时 searchQuestionBank 回退本地种子题库
  questionBankApiUrl: process.env.QUESTION_BANK_API_URL ?? '',
  // 推理强度（none/low/medium/high，透传为请求体 reasoning_effort；非枚举值由 callLLM 忽略；Wave 11）
  llmReasoningEffort: process.env.LLM_REASONING_EFFORT ?? '',
};

export default env;