<script setup>
// QuestionCard.vue —— 题卡渲染（C3.1 实现，C2 答案隐藏红线）
// 只接收 { id, question, options, knowledgePoint }（外加父组件传入的 index 题号与 selected 当前选中项）；
// 答案解析字段严禁传入本组件（docs/DATA_SCHEMA.md §4.3），渲染层对正确答案零感知。
//
// 交互：点击选项 → emit('select', { id, option }) 交给父组件记录，选中高亮由
// CSS 类 .option.selected 控制（受控组件：selected 来自父组件，点选后可改选）。
// 本组件不管理提交、不保存作答状态。

import { computed } from 'vue'

const props = defineProps({
  /** 题目唯一标识（父组件用于判题定位，不属于渲染内容） */
  id: { type: [Number, String], required: true },
  /** 题号（从 0 开始，由父组件经 v-for 传入，展示时 +1） */
  index: { type: Number, default: 0 },
  /** 题干文本 */
  question: { type: String, required: true },
  /** 选项集合 { A: '...', B: '...', C: '...', D: '...' } */
  options: { type: Object, default: () => ({}) },
  /** 知识点标签（右上角展示，可缺省） */
  knowledgePoint: { type: String, default: '' },
  /** 当前选中选项键（'' 表示未选；由父组件 answers 映射驱动） */
  selected: { type: String, default: '' },
  /** 是否锁定：提交后可改选需禁止（父组件 submitted 驱动；不影响选中态展示） */
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

/** 选项键固定顺序（A/B/C/D，docs/DATA_SCHEMA.md §4：恰为四键） */
const OPTION_KEYS = ['A', 'B', 'C', 'D']

/** 选项是否齐全（A-D 四键均非空） */
const hasValidOptions = computed(() => props.options && OPTION_KEYS.every((k) => props.options[k]))

/** 点击某个选项：通知父组件记录作答（允许改选，不做提交）；已提交锁定后忽略点击 */
function onSelectOption(option) {
  if (props.disabled) return
  emit('select', { id: props.id, option })
}
</script>

<template>
  <div class="card">
    <div class="card-header">
      <span class="card-index">第 {{ index + 1 }} 题</span>
      <span v-if="knowledgePoint" class="knowledge-tag">{{ knowledgePoint }}</span>
    </div>

    <p class="card-question">{{ question }}</p>

    <ul v-if="hasValidOptions" class="option-list">
      <li
        v-for="key in OPTION_KEYS"
        :key="key"
        class="option"
        :class="{ selected: selected === key, locked: disabled }"
        @click="onSelectOption(key)"
      >
        <span class="option-key">{{ key }}</span>
        <span class="option-text">{{ options[key] }}</span>
      </li>
    </ul>
    <p v-else class="option-warn">本题选项暂不可用</p>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md, 16px);
}

.card-index {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
}

/* 右上角知识点标签（Apple 橙） */
.knowledge-tag {
  flex: none;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 20px;
  color: #c05c00;
  background: rgba(255, 149, 0, 0.12);
  border: 1px solid rgba(255, 149, 0, 0.35);
  border-radius: 999px;
}

.card-question {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text, #1f2937);
}

/* 选项列表：可点选、选中高亮（.option.selected） */
.option-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--spacing-sm, 8px);
}

.option {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm, 8px);
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #1f2937);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.option:hover {
  border-color: var(--color-primary, #2563eb);
}

.option.selected {
  border-color: var(--color-primary, #2563eb);
  background: rgba(0, 113, 227, 0.08);
  box-shadow: 0 0 0 1px var(--color-primary, #2563eb);
}

/* 提交后锁定：禁止改选，视觉提示不可交互 */
.option.locked {
  cursor: not-allowed;
  opacity: 0.75;
}

.option.locked:hover {
  border-color: var(--color-border, #e5e7eb);
}

.option-key {
  flex: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  background: var(--color-bg, #f3f5f9);
  border-radius: 50%;
}

.option.selected .option-key {
  color: #fff;
  background: var(--color-primary, #2563eb);
}

.option-warn {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}
</style>