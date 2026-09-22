<script setup>
// ResultPanel.vue —— 判题结果 / 解析 / 汇总 + 学习统计（C3.2 实现，替换 Wave 1 占位）
//
// C2 约束：本组件是否挂载由父组件控制（App.vue v-if="submitted && results.length"），
// 即仅"提交判题完成后"才实例化。results 中的 answer/analysis 因此只在提交后进入 DOM，
// 提交前渲染层零泄露（docs/DATA_SCHEMA.md §4.3）。
//
// 渲染结构：
//  - 汇总条：共 N 题 / 答对 X / 答错 Y / 未作答 Z / 正确率%"答对 / 已答"口径（未作答不计入分母）
//  - 逐题卡片：对错标识 + 用户作答常显；正确答案（字母 + 选项文本）与解析为折叠区
//    （新结果默认展开，可逐卡收起，保持页面简洁）
//  - 学习统计小面板：累计作答题数 / 累计正确率（已答口径）/ 薄弱知识点 Top2（样本 <3 标注"样本不足"）

import { reactive, watch } from 'vue'

const props = defineProps({
  /** 判题结果数组 [{ qId, correct, userAnswer, correctAnswer, analysis }]；correct: true / false / null（空答） */
  results: { type: Array, default: () => [] },
  /** 渲染层题目 [{ id, question, options, knowledgePoint }]，用于对齐题干与选项文本 */
  questions: { type: Array, default: () => [] },
  /** 本组汇总 { total, correct, wrong, unanswered, answered, accuracy }（由 App.vue 给出） */
  summary: {
    type: Object,
    default: () => ({ total: 0, correct: 0, wrong: 0, unanswered: 0, answered: 0, accuracy: 0 })
  },
  /** 学习统计聚合 { answeredTotal, correctTotal, accuracy, weakPoints[] }（来自 localStorage，见 web/src/stats.js） */
  stats: { type: Object, default: () => ({ answeredTotal: 0, correctTotal: 0, accuracy: 0, weakPoints: [] }) }
})

/** 每张卡片折叠区是否展开：新结果默认全部展开，用户可逐卡收起 */
const expanded = reactive({})
watch(
  () => props.results,
  (list) => {
    for (const r of list) expanded[r.qId] = true
  },
  { immediate: true }
)

function toggleCard(qId) {
  expanded[qId] = !expanded[qId]
}

/** 依据 correct 三态给出对错标识（true 绿 / false 红 / null 灰"未作答"） */
function statusOf(correct) {
  if (correct === true) return { text: '正确', cls: 'st-correct' }
  if (correct === false) return { text: '错误', cls: 'st-wrong' }
  return { text: '未作答', cls: 'st-unanswered' }
}

/** 由题目 id 反查渲染层题目（题干 / 选项文本） */
function questionOf(qId) {
  return props.questions.find((q) => q.id === qId) || null
}

/** 数字格式化：保留至多 1 位小数（去掉多余 0） */
function fmtRate(n) {
  return String(Math.round(n * 10) / 10)
}
</script>

<template>
  <section class="result-panel panel">
    <h2 class="panel-title">{{ results.length ? '判题结果' : '学习统计' }}</h2>

    <template v-if="results.length">
    <!-- 汇总条：答对 / 已答口径 -->
    <div class="summary-bar">
      <span class="summary-cell">共 <b>{{ summary.total }}</b> 题</span>
      <span class="summary-cell">答对 <b class="s-correct">{{ summary.correct }}</b></span>
      <span class="summary-cell">答错 <b class="s-wrong">{{ summary.wrong }}</b></span>
      <span class="summary-cell">未作答 <b class="s-unanswered">{{ summary.unanswered }}</b></span>
      <span class="summary-cell">
        正确率 <b class="s-rate">{{ summary.answered ? `${fmtRate(summary.accuracy)}%` : '—' }}</b>
        <em class="rate-note">（答对 / 已答，未作答不计入分母）</em>
      </span>
    </div>

    <!-- 逐题结果卡片 -->
    <ul class="result-list">
      <li v-for="(r, idx) in results" :key="r.qId" class="result-card">
        <button type="button" class="card-head" :aria-expanded="!!expanded[r.qId]" @click="toggleCard(r.qId)">
          <span class="head-index">第 {{ idx + 1 }} 题</span>
          <span class="head-question">{{ (questionOf(r.qId) && questionOf(r.qId).question) || '（题目缺失）' }}</span>
          <span class="status-tag" :class="statusOf(r.correct).cls">{{ statusOf(r.correct).text }}</span>
        </button>

        <!-- 折叠详情：正确选项 + 解析（提交后展示为合法渲染时机） -->
        <div v-if="expanded[r.qId]" class="card-detail">
          <p class="detail-line">
            <span class="detail-label">你的作答</span>
            <template v-if="r.userAnswer">
              {{ r.userAnswer }}. {{ (questionOf(r.qId) && questionOf(r.qId).options[r.userAnswer]) || '' }}
            </template>
            <span v-else class="detail-empty">未作答</span>
          </p>
          <p class="detail-line">
            <span class="detail-label">正确答案</span>
            <b class="answer-letter">{{ r.correctAnswer }}</b>
            <span class="answer-text">{{ (questionOf(r.qId) && questionOf(r.qId).options[r.correctAnswer]) || '' }}</span>
          </p>
          <p class="detail-line detail-analysis">
            <span class="detail-label">解析</span>
            <span>{{ r.analysis }}</span>
          </p>
        </div>
      </li>
    </ul>
    </template>

    <!-- 学习统计（localStorage 持久化；无本组结果时本面板单独展示，刷新后仍有累计记录） -->
    <div class="stats-box">
      <h3 class="stats-title">学习统计</h3>
      <div class="stats-grid">
        <span>累计作答题数 <b>{{ stats.answeredTotal }}</b></span>
        <span>
          累计正确率
          <b>{{ stats.answeredTotal ? `${fmtRate(stats.accuracy)}%` : '—' }}</b>
          <em class="rate-note">（已答口径）</em>
        </span>
      </div>
      <p class="stats-sub">薄弱知识点</p>
      <ul v-if="stats.weakPoints.length" class="weak-list">
        <li v-for="w in stats.weakPoints" :key="w.kp" class="weak-item">
          <span class="weak-kp">{{ w.kp }}</span>
          <span class="weak-rate">
            {{ w.total ? `${fmtRate(w.rate)}%` : '—' }}（{{ w.correct }}/{{ w.total }}）
            <em v-if="w.insufficient" class="weak-insufficient">样本不足</em>
          </span>
        </li>
      </ul>
      <p v-else class="weak-empty">暂无记录 —— 完成一次提交后生成</p>
    </div>
  </section>
</template>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
}

/* —— 汇总条 —— */
.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.summary-cell b {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
}

.s-correct { color: var(--color-success, #34c759); }
.s-wrong { color: var(--color-danger, #ff3b30); }
.s-unanswered { color: #86868b; }
.s-rate { color: var(--color-primary, #2563eb); }

.rate-note {
  font-style: normal;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

/* —— 逐题卡片 —— */
.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
}

.result-card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
}

/* 卡片头部可点击：折叠 / 展开 */
.card-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  padding: 10px 14px;
  font: inherit;
  text-align: left;
  color: var(--color-text, #1f2937);
  background: var(--color-surface, #fff);
  border: none;
  cursor: pointer;
}

.card-head:hover {
  background: rgba(0, 0, 0, 0.03);
}

.head-index {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
}

.head-question {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 对错标识：正确绿 / 错误红 / 未作答灰（Apple 语义色） */
.status-tag {
  flex: none;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.st-correct {
  color: var(--color-success, #34c759);
  background: var(--color-success-bg, rgba(52, 199, 89, 0.14));
  border-color: rgba(52, 199, 89, 0.3);
}

.st-wrong {
  color: var(--color-danger, #ff3b30);
  background: var(--color-danger-bg, rgba(255, 59, 48, 0.12));
  border-color: rgba(255, 59, 48, 0.3);
}

.st-unanswered {
  color: #6b7280;
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

/* 卡片详情 */
.card-detail {
  padding: var(--spacing-sm, 8px) 14px 12px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: #fbfcfe;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.detail-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #1f2937);
}

.detail-label {
  display: inline-block;
  margin-right: 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.detail-empty {
  color: var(--color-text-secondary, #86868b);
}

.answer-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  font-size: 12px;
  color: #fff;
  background: var(--color-success, #34c759);
  border-radius: 50%;
}

.answer-text {
  font-weight: 600;
}

.detail-analysis {
  color: var(--color-text-secondary, #6b7280);
  padding-top: var(--spacing-xs, 4px);
  border-top: 1px dashed var(--color-border, #e5e7eb);
}

/* —— 学习统计 —— */
.stats-box {
  padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
  background: var(--color-warn-bg, rgba(255, 149, 0, 0.14));
  border: 1px solid rgba(255, 149, 0, 0.3);
  border-radius: var(--radius-sm, 6px);
}

.stats-title {
  margin: 0 0 var(--spacing-xs, 4px);
  font-size: 14px;
  font-weight: 600;
  color: #b25000;
}

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs, 4px) var(--spacing-lg, 24px);
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.stats-grid b {
  font-size: 15px;
  color: var(--color-text, #1f2937);
}

.stats-sub {
  margin: var(--spacing-sm, 8px) 0 var(--spacing-xs, 4px);
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.weak-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.weak-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md, 16px);
  padding: 6px 10px;
  background: var(--color-surface, #fff);
  border: 1px solid rgba(255, 149, 0, 0.3);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
}

.weak-kp {
  font-weight: 600;
  color: #b25000;
}

.weak-rate {
  color: var(--color-text-secondary, #6b7280);
}

.weak-insufficient {
  font-style: normal;
  padding: 1px 6px;
  font-size: 11px;
  color: #b25000;
  background: var(--color-warn-bg, rgba(255, 149, 0, 0.14));
  border-radius: 999px;
}

.weak-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}
</style>