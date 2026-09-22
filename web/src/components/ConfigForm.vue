<script setup>
// ConfigForm.vue —— 配置表单 + 自然语言输入（C3.1 实现）
// 职责：收集出题配置（模块/难度/题量）与自然语言需求，点击「生成题目」时
// emit('submit', { form, requirement }) 交由父组件（App.vue）统一调用 api/client.js
// 发起请求；本组件自身不做任何网络请求（AGENTS.md §4：前端请求必须经 api/client.js）。
//
// 地区/考试/科目为 Demo 固定值（docs/ARCHITECTURE.md 限定黑龙江省考行测）：
// 界面只读展示「黑龙江省 / 省考 / 行测」，form 携带 schema 取值
// { exam: '黑龙江省考', subject: '行测' }（docs/DATA_SCHEMA.md §2.1）。

import { reactive, ref } from 'vue'

/** 模块白名单（与 docs/DATA_SCHEMA.md §2.2 五大模块一致；默认「资料分析」为数组索引 3） */
const MODULES = ['言语理解与表达', '判断推理', '数量关系', '资料分析', '常识判断']
/** 难度枚举（与 docs/DATA_SCHEMA.md §2.1 一致；默认「中等」为数组索引 1） */
const DIFFICULTIES = ['简单', '中等', '困难']
/** 题量合法区间（docs/DATA_SCHEMA.md §2.1：整数 1 ~ 10） */
const COUNT_RANGE = Object.freeze({ MIN: 1, MAX: 10 })
/** Demo 固定展示值（地区/考试/科目），schema 取值见 FIXED_FORM */
const FIXED_LABELS = Object.freeze({ region: '黑龙江省', exam: '省考', subject: '行测' })
/** form 中固定携带的 schema 字段值（docs/DATA_SCHEMA.md §2.4 默认值） */
const FIXED_FORM = Object.freeze({ exam: '黑龙江省考', subject: '行测' })

const props = defineProps({
  /** 出题请求进行中的加载状态：为 true 时按钮 disabled 且文案「生成中…」，防连点（Wave4 回归项⑥） */
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['submit'])

// 工作表单状态：module/difficulty/count 可调，默认值（资料分析/中等/3）与 DATA_SCHEMA §2.4 一致
const formState = reactive({
  ...FIXED_FORM,
  module: MODULES[3],
  difficulty: DIFFICULTIES[1],
  count: 3
})

/** 自然语言需求文本（可为空） */
const requirement = ref('')

/** 步进调整题量，钳制在 [COUNT_RANGE.MIN, COUNT_RANGE.MAX] 内 */
function adjustCount(delta) {
  const next = formState.count + delta
  formState.count = Math.min(COUNT_RANGE.MAX, Math.max(COUNT_RANGE.MIN, next))
}

/** 提交：把表单与需求交还父组件，不在此处发起请求 */
function handleSubmit() {
  emit('submit', {
    form: { ...formState },
    requirement: requirement.value.trim()
  })
}
</script>

<template>
  <section class="config-form panel">
    <h2 class="panel-title">练习配置</h2>

    <!-- 固定项：地区 / 考试 / 科目（Demo 固定值，只读展示） -->
    <div class="fixed-row">
      <span class="fixed-item">地区 <b>{{ FIXED_LABELS.region }}</b></span>
      <span class="fixed-item">考试 <b>{{ FIXED_LABELS.exam }}</b></span>
      <span class="fixed-item">科目 <b>{{ FIXED_LABELS.subject }}</b></span>
    </div>

    <label class="field">
      <span class="field-label">模块</span>
      <select v-model="formState.module" class="control select-control">
        <option v-for="m in MODULES" :key="m" :value="m">{{ m }}</option>
      </select>
    </label>

    <div class="field" role="radiogroup" aria-label="难度">
      <span class="field-label">难度</span>
      <div class="segmented">
        <button
          v-for="d in DIFFICULTIES"
          :key="d"
          type="button"
          class="segment"
          role="radio"
          :class="{ active: formState.difficulty === d }"
          :aria-checked="formState.difficulty === d"
          @click="formState.difficulty = d"
        >{{ d }}</button>
      </div>
    </div>

    <label class="field">
      <span class="field-label">题量（{{ COUNT_RANGE.MIN }} ~ {{ COUNT_RANGE.MAX }}）</span>
      <div class="count-stepper">
        <button
          type="button"
          class="step-btn"
          :disabled="formState.count <= COUNT_RANGE.MIN"
          aria-label="减少题量"
          @click="adjustCount(-1)"
        >−</button>
        <input
          v-model.number="formState.count"
          class="control count-input"
          type="number"
          :min="COUNT_RANGE.MIN"
          :max="COUNT_RANGE.MAX"
          step="1"
        />
        <button
          type="button"
          class="step-btn"
          :disabled="formState.count >= COUNT_RANGE.MAX"
          aria-label="增加题量"
          @click="adjustCount(1)"
        >+</button>
      </div>
    </label>

    <div class="field">
      <span class="field-label">自然语言需求</span>
      <textarea
        v-model="requirement"
        class="control nl-input"
        rows="3"
        placeholder="例如：我黑龙江省考资料分析比较差，给我出3道中等难度的增长率题"
      ></textarea>
    </div>

    <button type="button" class="submit-btn" :disabled="loading" @click="handleSubmit">
      {{ loading ? '生成中…' : '生成题目' }}
    </button>

    <p class="hint">
      两种路径任选：直接输入自然语言描述需求，或用上方手动配置精确出题；<br />
      手动配置的选项优先于语言描述中的参数。
    </p>
  </section>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
}

/* 固定值只读展示：灰色小号 */
.fixed-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs, 4px) var(--spacing-md, 16px);
  padding: var(--spacing-sm, 8px);
  background: rgba(0, 0, 0, 0.03);
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}

.fixed-item b {
  font-weight: 600;
  color: var(--color-text, #1f2937);
}

/* 表单项 */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.control {
  width: 100%;
  font-size: 14px;
  color: var(--color-text, #1f2937);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  padding: 8px 10px;
  outline: none;
}

.control:focus {
  border-color: var(--color-primary, #2563eb);
  box-shadow: 0 0 0 4px var(--color-focus-ring, rgba(0, 113, 227, 0.3));
}

/* 难度分段控件：Apple segmented 胶囊按钮组（替换原生 select） */
.segmented {
  display: inline-flex;
  align-self: flex-start;
  padding: 2px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--radius-pill, 980px);
}

.segment {
  padding: 7px 14px;
  font-size: 13px;
  line-height: 18px;
  color: var(--color-text, #1f2937);
  background: transparent;
  border: none;
  border-radius: var(--radius-pill, 980px);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
}

.segment:hover:not(.active) {
  color: var(--color-primary, #0071e3);
}

.segment.active {
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  font-weight: 500;
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
}

/* 题量步进：− / 输入框 / + */
.count-stepper {
  display: flex;
  gap: var(--spacing-xs, 4px);
  align-items: center;
}

.count-input {
  width: 72px;
  text-align: center;
  flex: none;
}

.step-btn {
  width: 36px;
  height: 36px;
  flex: none;
  font-size: 18px;
  line-height: 1;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-pill, 980px);
  background: var(--color-surface, #fff);
  color: var(--color-primary, #0071e3);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.step-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #0071e3);
  background: rgba(0, 113, 227, 0.06);
}

.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 自然语言输入 */
.nl-input {
  resize: vertical;
  min-height: 72px;
  line-height: 1.6;
}

/* 提交按钮：Apple 胶囊主按钮 */
.submit-btn {
  width: 100%;
  height: 44px;
  padding: 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #0071e3);
  border: none;
  border-radius: var(--radius-pill, 980px);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-primary-hover, #0062c4);
}

.submit-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--color-focus-ring, rgba(0, 113, 227, 0.3));
}

.submit-btn:disabled {
  background: rgba(0, 0, 0, 0.18);
  cursor: not-allowed;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary, #6b7280);
}
</style>