// POST /api/explain —— 追问讲解（加分项 B3，Wave 2 接入）
// 请求体：{ question, analysis, userAsk? }；响应：{ explanation }
// 无 Key：本地模板把 analysis 重述为口语化讲解（基础字符串加工，不调 LLM）；
// 有 Key：调 callLLM 生成通俗讲解（system 指定公考辅导老师角色）。
// 异常 → {error:{code:503,message:'讲解服务暂不可用'}}（辅助能力，不做 Mock 兜底）。

import { Router } from 'express';

import { env } from '../config/env.js';
import { callLLM } from '../services/callLLM.js';

const router = Router();

const EXPLAIN_ERROR = { error: { code: 503, message: '讲解服务暂不可用' } };

/**
 * 本地模板讲解：把 analysis（可含 question/userAsk）重述为「一步步看」的口语化文本。
 * 仅做字符串加工：拆句编号 + 模板话术，不调用任何外部服务。
 */
function _templateExplanation({ question = '', analysis = '', userAsk = '' }) {
  const sentences = (analysis || '')
    .replace(/[。！？；;]/g, '。')
    .split('。')
    .map((s) => s.trim())
    .filter(Boolean);

  const parts = [];
  if (userAsk && userAsk.trim()) {
    parts.push(`先回答你的疑问：「${userAsk.trim()}」。`);
  }
  parts.push('用大白话一步一步来看：');
  if (sentences.length > 0) {
    sentences.forEach((sentence, index) => {
      parts.push(`${index + 1}. ${sentence}。`);
    });
  } else if (question && question.trim()) {
    parts.push(`这道题问的是：「${question.trim()}」。`);
  }
  if (question && question.trim()) {
    parts.push(`关键是理解题干里的条件（${question.trim().slice(0, 60)}……），再套用对应公式或方法，就能锁定正确答案。`);
  }
  parts.push('简单说：先弄清题目在问什么，再按步骤计算/推理，逐句对照选项即可。');
  return parts.join('\n');
}

router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { question = '', analysis = '', userAsk = '' } = body;

  // 有 Key：走 LLM 生成通俗讲解
  if (env.llmApiKey) {
    try {
      const userContent = [
        `【题干】${question || '（无题干）'}`,
        `【解析】${analysis || '（无解析）'}`,
        userAsk ? `【我的疑问】${userAsk}` : null,
        '请用大白话、口语化的方式把这道题讲懂，可以打比方、举例子，500 字以内。',
      ].filter(Boolean).join('\n');
      const explanation = await callLLM([
        { role: 'system', content: '你是公考辅导老师，擅长用大白话把题目讲懂，语言通俗、亲切，500 字以内。' },
        { role: 'user', content: userContent },
      ]);
      res.json({ explanation });
      return;
    } catch (err) {
      // 有 Key 但模型调用失败（超时/网络/HTTP）→ 503（讲解属辅助能力，不做 Mock）
      console.error(`[explain] LLM 讲解失败（${err?.kind ?? 'UNKNOWN'}）：${err?.message ?? err}`);
    }
    res.status(503).json(EXPLAIN_ERROR);
    return;
  }

  // 无 Key：本地模板重述（容错：模板内部失败同样按 503 处理）
  try {
    const explanation = _templateExplanation({ question, analysis, userAsk });
    res.json({ explanation });
  } catch (err) {
    console.error('[explain] 本地模板讲解失败：', err?.message ?? err);
    res.status(503).json(EXPLAIN_ERROR);
  }
});

export default router;