// stats.js —— 学习统计持久化与聚合（C3.2 实现，B4 加分项前置）
//
// 存储契约（localStorage key 固定为 'hlj-kaoqa-stats'）：
//   记录结构 [{ module, knowledgePoint, correct, total, ts }]
//     - module: 出题模块（如 "资料分析"）
//     - knowledgePoint: 知识点标签（后端 Question.knowledgePoint 缺失时由调用方用模块名兜底）
//     - correct: 0 / 1（该题答对与否）
//     - total: 1（逐题粒度记录，每条约一道题）
//     - ts: 提交判题时间戳（Date.now()）
//
// 判题口径（与 C3.2 判题规则一致）：空答（未作答）不计对也不计错，
// 因此空答题目「不写入」统计记录 —— 统计口径与判题口径同为"已答"。
// 本模块仅在浏览器端使用（Vue SPA）；localStorage 不可用时（隐私模式等）静默降级，不抛错。

export const STATS_KEY = 'hlj-kaoqa-stats'

/** 读取历史记录；localStorage 不可用 / JSON 损坏时返回空数组 */
export function loadStats() {
  try {
    const raw = window.localStorage.getItem(STATS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 追加一组记录并写回，返回最新全量记录（供父组件同步内存态） */
export function appendStats(records) {
  const next = loadStats().concat(records)
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next))
  } catch {
    // 写失败降级：本次数据仍保留在返回的内存数组中，刷新后可能丢失（可接受的演示边界）
  }
  return next
}

/** 对错数值归一：兼容 0/1 与布尔两种存储形态 */
function _isCorrect(value) {
  return value === 1 || value === true
}

/**
 * 聚合统计
 * @param {Array<{correct:number|boolean, total:number, knowledgePoint?:string}>} records
 * @returns {{ answeredTotal:number, correctTotal:number, accuracy:number, weakPoints:Array }}
 *   accuracy 按"已答口径"：已答对题数 / 已答总题数 × 100（保留 1 位小数；未作答不入参，分母天然为已答数）。
 *   weakPoints：正确率最低的至多 2 个知识点；样本（该知识点累计题数）< 3 时 insufficient=true，
 *   面板据此标注"样本不足"（防止小样本偶然性误导）。
 */
export function computeStats(records) {
  const answeredTotal = records.length
  const correctTotal = records.reduce((sum, r) => sum + (_isCorrect(r.correct) ? 1 : 0), 0)
  const accuracy = answeredTotal ? Math.round((correctTotal / answeredTotal) * 1000) / 10 : 0

  const byKp = new Map()
  for (const r of records) {
    const kp = r.knowledgePoint || '未知知识点'
    const entry = byKp.get(kp) || { kp, total: 0, correct: 0 }
    entry.total += typeof r.total === 'number' ? r.total : 1
    entry.correct += _isCorrect(r.correct) ? 1 : 0
    byKp.set(kp, entry)
  }

  const weakPoints = [...byKp.values()]
    .map((e) => ({
      kp: e.kp,
      total: e.total,
      correct: e.correct,
      rate: e.total ? Math.round((e.correct / e.total) * 1000) / 10 : 0,
      insufficient: e.total < 3
    }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, 2)

  return { answeredTotal, correctTotal, accuracy, weakPoints }
}