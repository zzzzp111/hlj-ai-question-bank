<script setup>
// App.vue —— 整体布局 + 出题生成链路组装（C3.1）+ 作答判题与结果汇总（C3.2）
// 顶部标题栏（项目名 + Mock 状态徽标）；主体左侧配置区（ConfigForm）、
// 右侧题目列表区 QuestionCard 列表 + 作答操作区（提交本组/重新作答）+ 结果区（ResultPanel）。
//
// 生成链路：ConfigForm submit → postJSON('/api/generate', body)：
//   - 成功：完整副本（含答案/解析）存 rawQuestions 供判题只读使用；
//     渲染层 displayQuestions 仅保留 { id, question, options, knowledgePoint }（C2 强制剥离）。
//   - 失败：error = { code, message }，错误条 + 「重试」（重放 lastBody）。
//   - 加载：三步骤指示（解析需求 → 调用模型 → 校验题目）；mock 徽标由响应 mock 字段驱动。
//
// 判题链路（C3.2）：「提交本组」→ 依 rawQuestions 比对生成 results（此时 answer/analysis 才进入
// 渲染数据，由 ResultPanel 展示）；空答 correct=null（不计对也不计错）；学习统计写入
// localStorage（key 'hlj-kaoqa-stats'），统计口径与判题口径一致为"已答"（见 web/src/stats.js）。

import { reactive, ref, computed } from 'vue'
import { postJSON } from './api/client.js'
import { loadStats, appendStats, computeStats } from './stats.js'
import ConfigForm from './components/ConfigForm.vue'
import QuestionCard from './components/QuestionCard.vue'
import ResultPanel from './components/ResultPanel.vue'

/** 出题配置默认值（docs/DATA_SCHEMA.md §2.4；与 ConfigForm 内部默认保持一致） */
const DEFAULT_FORM = Object.freeze({ module: '资料分析', difficulty: '中等', count: 3 })

/** 生成中三步骤指示文案（对应后端七步流程中的核心三步） */
const GENERATE_STEPS = ['解析需求', '调用模型', '校验题目']

// —— 页面状态 ——
const formState = reactive({ ...DEFAULT_FORM }) // 最近一次提交的配置（模块/难度/题量）
const requirement = ref('') // 最近一次提交的自然语言需求（镜像，重试时并入 lastBody）
const displayQuestions = ref([]) // 渲染层题目：仅 { id, question, options, knowledgePoint }（C2 剥离）
const rawQuestions = ref([]) // 完整副本（含答案/解析，仅内存不渲染，供 Wave 3 判题）
const generating = ref(false) // 出题进行中（加载态 / 防连点）
const error = ref(null) // { code, message } 或 null
const mockStatus = ref(null) // null=尚未出题 / true=Mock / false=真实模型
const answers = reactive({}) // 作答映射 { questionId: option }（点选高亮 + 判题比对源）
const results = ref([]) // 判题结果：提交后生成 [{ qId, correct, userAnswer, correctAnswer, analysis }]
const submitted = ref(false) // 本组是否已提交（提交后锁作答 / 防重复提交）
const submitNotice = ref('') // 提交提示（未作答提示 / 请先作答等）
const statsRecords = ref(loadStats()) // 学习统计历史（localStorage key 'hlj-kaoqa-stats'，刷新后仍在）
let lastBody = null // 上次请求体，供「重试」原样重放

/** 生成请求核心链路（首次提交 / 「重试」共用；options.append=true 时为 B2 追加模式） */
async function _runGenerate(body, options = {}) {
  // 防连点（REGRESSION R3）：生成中直接吞掉后续触发，避免重复请求（含「再来一道类似」链路）
  if (generating.value) return
  lastBody = body
  generating.value = true
  error.value = null
  try {
    const res = await postJSON('/api/generate', body)
    // 失败：统一错误结构 { error: { code, message } }（含网络层归一化，见 api/client.js）
    if (res && res.error) {
      error.value = { code: res.error.code, message: res.error.message }
      return
    }
    // 成功：完整副本进 rawQuestions；渲染层仅保留 { id, question, options, knowledgePoint }（C2 强制剥离）
    const full = (res.questions || []).map((q) => ({ ...q, options: { ...q.options } }))
    const strip = (q) => ({ id: q.id, question: q.question, options: q.options, knowledgePoint: q.knowledgePoint })
    if (options.append) {
      // B2 追加模式：「再来一道类似」——新题并入现有列表（按 id 去重，正常不会重复），
      // 保留上一轮已选答案（不清空 answers）；题目集合已变 → 旧判题结果作废
      const existingIds = new Set(rawQuestions.value.map((q) => q.id))
      const fresh = full.filter((q) => !existingIds.has(q.id))
      rawQuestions.value = rawQuestions.value.concat(fresh)
      displayQuestions.value = displayQuestions.value.concat(fresh.map(strip))
      results.value = []
      submitted.value = false
      submitNotice.value = ''
    } else {
      // 替换模式：新一轮题目，清空上一轮作答选中 / 判题结果，恢复可作答状态
      rawQuestions.value = full
      displayQuestions.value = full.map(strip)
      for (const key of Object.keys(answers)) delete answers[key]
      results.value = []
      submitted.value = false
      submitNotice.value = ''
    }
    mockStatus.value = !!res.mock
  } finally {
    generating.value = false
  }
}

/** ConfigForm submit：组装请求体（显式字段始终携带、后端优先；requirement 非空才附加） */
function handleSubmit({ form, requirement: reqText }) {
  formState.module = form.module
  formState.difficulty = form.difficulty
  formState.count = form.count
  requirement.value = reqText
  const body = { ...form }
  if (reqText) body.requirement = reqText
  _runGenerate(body)
}

/** 重试按钮：重放上次请求体（上次请求若成功则不显示该按钮） */
function handleRetry() {
  if (lastBody) _runGenerate(lastBody)
}

/** 「再来一道类似」（B2）：以上一题的模块/知识点/难度为上下文，追加生成 1 道类似新题。
 *  已出过的题干全部放入 context.excludedQuestions 请求后端硬去重；answers 已选保留，仅失效旧判题结果 */
function handleAnotherSimilar() {
  if (!displayQuestions.value.length) return // 无题不触发（按钮 v-show 兜底，防直调）
  const body = {
    module: formState.module,
    count: 1,
    context: {
      knowledgePoint: displayQuestions.value[0]?.knowledgePoint || '',
      difficulty: formState.difficulty,
      excludedQuestions: displayQuestions.value.map((q) => q.question),
    },
  }
  _runGenerate(body, { append: true }) // R3 守卫在 _runGenerate 内：generating 时静默吞掉
}

/** 关闭错误提示条 */
function closeError() {
  error.value = null
}

/** QuestionCard 选中回调：记录到 answers（允许改选，不做判题） */
function handleSelect({ id, option }) {
  answers[id] = option
}

/** 判题：与 rawQuestions 比对生成逐题结果（提交后 answer/analysis 才放入 results —— C2） */
function handleSubmitAll() {
  // 无任何作答：按钮已按 disabled 拦截，此处兜底提示（防自动化/极端时序直调）
  if (Object.keys(answers).length === 0) {
    submitNotice.value = '请先作答：至少点选一题选项后再提交'
    return
  }

  // 判题口径：userAnswer === answer → true；userAnswer 非空但不匹配 → false；
  // userAnswer 为空（未作答）→ null（不计对也不计错，仅提示）
  const list = rawQuestions.value.map((q) => {
    const userAnswer = answers[q.id] || ''
    let correct = null
    if (userAnswer !== '') correct = userAnswer === q.answer
    return { qId: q.id, correct, userAnswer, correctAnswer: q.answer, analysis: q.analysis }
  })
  results.value = list
  submitted.value = true

  const unansweredCount = list.filter((r) => r.correct === null).length
  submitNotice.value = unansweredCount
    ? `有 ${unansweredCount} 题未作答，已视为未作答（不计对错），正确率仅按已答题计算`
    : ''

  // 学习统计（localStorage）：仅记录已作答题目 —— 与判题口径一致（"已答"，见 web/src/stats.js）
  const records = list
    .filter((r) => r.correct !== null)
    .map((r) => {
      const q = rawQuestions.value.find((x) => x.id === r.qId)
      return {
        module: formState.module,
        knowledgePoint: (q && q.knowledgePoint) || formState.module,
        correct: r.correct === true ? 1 : 0,
        total: 1,
        ts: Date.now()
      }
    })
  if (records.length) statsRecords.value = appendStats(records)
}

/** 重新作答：清空本组作答与判题结果，恢复题卡可选状态（不删除历史学习统计） */
function handleReset() {
  for (const key of Object.keys(answers)) delete answers[key]
  results.value = []
  submitted.value = false
  submitNotice.value = ''
}

/** 本组汇总：正确率按"已答"口径（未作答不进分母） */
const summary = computed(() => {
  const total = results.value.length
  const correct = results.value.filter((r) => r.correct === true).length
  const wrong = results.value.filter((r) => r.correct === false).length
  const unanswered = results.value.filter((r) => r.correct === null).length
  const answered = total - unanswered
  const accuracy = answered ? Math.round((correct / answered) * 1000) / 10 : 0
  return { total, correct, wrong, unanswered, answered, accuracy }
})

/** 提交按钮可用性：至少一题作过答（无作答时 disabled + "请先作答"提示）；提交后由 submitted 锁死防重复 */
const canSubmit = computed(() => Object.keys(answers).length > 0)

/** 学习统计聚合（来自 localStorage，刷新后仍显示 —— B4 前置） */
const stats = computed(() => computeStats(statsRecords.value))

/** Mock 徽标：mock 为 true → 蓝色「Mock 模式」；false → 绿色「真实模型」；未出题 → 灰色兜底 */
const badgeMeta = computed(() => {
  if (mockStatus.value === false) return { text: '真实模型', cls: 'badge-real' }
  if (mockStatus.value === true) return { text: 'Mock 模式', cls: 'badge-mock' }
  return { text: 'Mock 模式', cls: 'badge-idle' }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="app-title">黑龙江省考 AI 出题 Agent</h1>
      <span class="mock-badge" :class="badgeMeta.cls">{{ badgeMeta.text }}</span>
    </header>

    <main class="app-main">
      <!-- 左侧：配置 / 自然语言输入区 -->
      <aside class="config-col">
        <ConfigForm :loading="generating" @submit="handleSubmit" />
      </aside>

      <!-- 右侧：加载态 / 错误态 / 题目列表区 + 结果区 -->
      <section class="content-col">
        <!-- 加载态：三步骤指示 -->
        <div v-if="generating" class="loading-bar panel">
          <span class="loading-title">生成中</span>
          <ol class="steps">
            <li v-for="(step, i) in GENERATE_STEPS" :key="step" class="step">
              <span class="step-index">{{ i + 1 }}</span>
              <span class="step-name">{{ step }}</span>
              <span class="step-ellipsis">…</span>
            </li>
          </ol>
          <span class="loading-hint">正在为您命制题目，请稍候…</span>
        </div>

        <!-- 错误态：红色提示条 + 重试 / 关闭 -->
        <div v-if="error" class="error-bar panel">
          <span class="error-icon">!</span>
          <span class="error-message">{{ error.message }}</span>
          <button type="button" class="btn btn-retry" @click="handleRetry">重试</button>
          <button
            type="button"
            class="btn btn-close"
            aria-label="关闭错误提示"
            @click="closeError"
          >×</button>
        </div>

        <!-- 题目列表区 -->
        <div class="question-list">
          <template v-if="displayQuestions.length">
            <QuestionCard
              v-for="(q, i) in displayQuestions"
              :key="q.id"
              :index="i"
              :id="q.id"
              :question="q.question"
              :options="q.options"
              :knowledge-point="q.knowledgePoint"
              :selected="answers[q.id] || ''"
              :disabled="submitted"
              @select="handleSelect"
            />
          </template>
          <p v-else class="question-list-empty">
            暂无题目 —— 在左侧配置练习需求，点击「生成题目」后在此展示题卡
          </p>
        </div>

        <!-- 作答操作区：提交本组（防重复提交）/ 重新作答（仅已有题目时显示） -->
        <div v-if="displayQuestions.length" class="action-bar">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="submitted || !canSubmit"
            @click="handleSubmitAll"
          >{{ submitted ? '已提交' : '提交本组' }}</button>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="generating"
            @click="handleAnotherSimilar"
          >再来一道类似</button>
          <button v-if="submitted" type="button" class="btn btn-secondary" @click="handleReset">重新作答</button>
          <span v-if="submitNotice" class="submit-notice">{{ submitNotice }}</span>
          <span v-else-if="!submitted && !canSubmit" class="submit-notice">尚未作答 —— 请先点选选项后再提交</span>
        </div>

        <!-- 结果区：提交判题后才渲染结果卡片；学习统计独立于判题结果 ——
             已有历史统计（localStorage）时也挂载，保证「刷新页面后统计仍在」（C3.2 验收） -->
        <ResultPanel
          v-if="(submitted && results.length) || statsRecords.length"
          :results="results"
          :questions="displayQuestions"
          :summary="summary"
          :stats="stats"
        />
      </section>
    </main>
  </div>
</template>

<style>
/* 基础样式变量：主色 / 中性色 / 间距 / 圆角（纯 CSS，无 UI 框架） */
:root {
  /* Apple 设计体系：背景 / 文字 / 主色 / 语义色 / 边框 / 阴影 / 圆角 */
  --color-primary: #0071e3;
  --color-primary-dark: #0077ed;
  --color-primary-hover: #0062c4;
  --color-bg: #f5f5f7;
  --color-surface: #ffffff;
  --color-text: #1d1d1f;
  --color-text-secondary: #86868b;
  --color-border: rgba(0, 0, 0, 0.08);
  --color-mock: #86868b;
  --color-focus-ring: rgba(0, 113, 227, 0.3);

  /* 语义色（Apple）：fail / danger / warn */
  --color-success: #34c759;
  --color-success-bg: rgba(52, 199, 89, 0.14);
  --color-danger: #ff3b30;
  --color-danger-bg: rgba(255, 59, 48, 0.12);
  --color-warn: #ff9500;
  --color-warn-bg: rgba(255, 149, 0, 0.14);

  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
  --shadow-float: 0 8px 28px rgba(0, 0, 0, 0.12);

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-pill: 980px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text',
    'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* 共享面板样式（ConfigForm / ResultPanel / QuestionCard 通用）：
   Apple 卡片 —— 白底 + 细边框(6% 黑) + 柔和投影 + 16px 圆角 */
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-card);
}

.panel-title {
  margin: 0 0 var(--spacing-md);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.panel-placeholder {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.8;
}
</style>

<style scoped>
.app {
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  gap: var(--spacing-lg);
}

/* 顶部标题栏：Apple 毛玻璃 —— 半透明白 + 背景模糊 + 细边框 + 大圆角 */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}

.app-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

/* Mock 徽标：由接口 mock 字段驱动（badge-mock 蓝 / badge-real 绿 / badge-idle 灰） */
.mock-badge {
  padding: 3px 12px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 999px;
  font-weight: 500;
}

.badge-idle {
  color: var(--color-mock);
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--color-border);
}

.badge-mock {
  color: #0071e3;
  background: rgba(0, 113, 227, 0.1);
  border: 1px solid rgba(0, 113, 227, 0.25);
}

.badge-real {
  color: #1d7f3b;
  background: var(--color-success-bg);
  border: 1px solid rgba(52, 199, 89, 0.3);
}

/* 主体两列布局 */
.app-main {
  display: flex;
  gap: var(--spacing-lg);
  align-items: flex-start;
  flex: 1;
}

.config-col {
  width: 320px;
  flex-shrink: 0;
}

.content-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  min-width: 0;
}

/* 加载态：三步骤指示条 */
.loading-bar {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.loading-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: var(--spacing-md);
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.step-index {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
  background: var(--color-primary);
  border-radius: 50%;
}

.step-ellipsis {
  animation: pulse 1.2s ease-in-out infinite;
  color: var(--color-primary);
}

@keyframes pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

.loading-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 错误态：红色提示条（Apple） */
.error-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-danger-bg);
  border: 1px solid rgba(255, 59, 48, 0.25);
  border-radius: var(--radius-sm);
}

.error-icon {
  flex: none;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--color-danger);
  border-radius: 50%;
}

.error-message {
  flex: 1;
  font-size: 14px;
  color: var(--color-danger);
}

/* 按钮基线：Apple 胶囊 + 焦点环 */
.btn {
  flex: none;
  min-height: 36px;
  padding: 6px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--color-focus-ring);
}

.btn-retry {
  color: #fff;
  background: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.btn-retry:hover {
  background: #e02e24;
}

.btn-close {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--color-danger);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 59, 48, 0.25);
}

/* 题目列表容器 */
.question-list {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.question-list-empty {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  text-align: center;
  line-height: 128px;
}

/* —— 作答操作区（C3.2）—— */
.action-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  padding: 0 var(--spacing-xs);
}

/* 提交 / 重新作答按钮（叠加全局 .btn 基线，提升为操作主按钮样式） */
.btn-primary {
  color: #fff;
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-primary:disabled {
  background: rgba(0, 0, 0, 0.18);
  border-color: transparent;
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  color: var(--color-primary);
  background: rgba(0, 113, 227, 0.1);
  border: 1px solid rgba(0, 113, 227, 0.25);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(0, 113, 227, 0.16);
}

.submit-notice {
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>