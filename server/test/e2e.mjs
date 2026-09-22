// 原子端到端测试（Wave 6 / Wave A）—— 一个命令产出二元结果：退出码 0 = 通过，非 0 = 不通过。
// 零第三方依赖：Node >= 18 原生 fetch + child_process。
// 自启被测服务（PORT=3199）→ 顺序执行 8 组用例 → 关闭服务 → 汇总。
// 运行：cd server && node test/e2e.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let child;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应保持 null，由用例判定
  }
  return { status: res.status, data };
}

const results = [];
function end(ok, name, detail = '') {
  results.push({ ok, name });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function main() {
  // 启动被测服务（index.js 在 NODE_ENV!=test 时才会 listen，故此处不设 test）
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });

  // 等待健康检查就绪（最长 20s）
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    try {
      const { status, data } = await request('/api/health');
      if (status === 200 && data?.ok === true) {
        ready = true;
        break;
      }
    } catch {
      // 服务未就绪，重试
    }
    await sleep(500);
  }
  if (!ready) {
    end(false, '被测服务在 20s 内未就绪', logs.slice(-500));
    return;
  }

  // 用例 1：健康检查
  {
    const { status, data } = await request('/api/health');
    end(status === 200 && data?.ok === true, 'GET /api/health → 200 且 { ok: true }', `status=${status}`);
  }

  // 用例 2：自然语言 → 结构化输出（mock 双轨为布尔值；无 Key 环境实测 true）
  // 注：parser 只识别阿拉伯数字题量（"一道"回落默认 3 题，见 parseRequirement.js countMatch），故用「1 道」
  {
    const { status, data } = await request('/api/generate', {
      method: 'POST',
      body: { requirement: '来 1 道资料分析题，关于增长率的' },
    });
    const ok =
      status === 200 &&
      typeof data?.mock === 'boolean' &&
      data?.exam === '黑龙江省考' &&
      data?.subject === '行测' &&
      data?.module === '资料分析' &&
      data?.difficulty === '中等' &&
      Array.isArray(data?.questions) &&
      data.questions.length === 1;
    end(
      ok,
      '自然语言「来 1 道资料分析题，关于增长率的」→ 结构化 JSON（exam/subject/module/difficulty/questions）',
      `status=${status}, questions=${data?.questions?.length}, mock=${data?.mock}`
    );
  }

  // 用例 3：每题字段完整性（题干非空、options 恰 A/B/C/D 四键非空、answer 属于四键、解析非空）
  {
    const { status, data } = await request('/api/generate', {
      method: 'POST',
      body: { requirement: '来 3 道资料分析题' },
    });
    const keys = ['A', 'B', 'C', 'D'];
    const bad = [];
    for (const q of data?.questions ?? []) {
      const opts = q?.options ?? {};
      const optKeys = Object.keys(opts).sort();
      if (typeof q.question !== 'string' || !q.question.trim()) bad.push('题干为空');
      if (optKeys.join('') !== 'ABCD') bad.push(`options 键不齐:${optKeys.join('')}`);
      const emptyOpt = keys.find((k) => !String(opts[k] ?? '').trim());
      if (emptyOpt) bad.push(`选项 ${emptyOpt} 为空`);
      if (!keys.includes(q.answer)) bad.push(`answer=${q.answer} 非法`);
      if (typeof q.analysis !== 'string' || !q.analysis.trim()) bad.push('解析为空');
    }
    const ok = status === 200 && Array.isArray(data?.questions) && data.questions.length === 3 && bad.length === 0;
    end(ok, '每题字段完整性：题干/四选项/答案/解析', bad.join('、') || `status=${status}`);
  }

  // 用例 4：非法 module → 400 + 统一错误体
  {
    const { status, data } = await request('/api/generate', {
      method: 'POST',
      body: { module: '芭蕾舞' },
    });
    const ok =
      status === 400 &&
      data?.error?.code === 400 &&
      typeof data?.error?.message === 'string' &&
      data.error.message.length > 0;
    end(ok, '非法 module → HTTP 400 + 统一错误结构 { error: { code, message } }', `status=${status}`);
  }

  // 用例 5：count 越界 / 非数字 → 400
  {
    const a = await request('/api/generate', { method: 'POST', body: { count: 99 } });
    const b = await request('/api/generate', { method: 'POST', body: { count: 'abc' } });
    const ok = a.status === 400 && b.status === 400;
    end(ok, 'count=99 与 count="abc" → HTTP 400', `count=99→${a.status}, count="abc"→${b.status}`);
  }

  // 用例 6：空 body → 200 默认配置（黑龙江省考/行测/资料分析/中等/3 题）
  {
    const { status, data } = await request('/api/generate', { method: 'POST', body: {} });
    const ok =
      status === 200 &&
      data?.exam === '黑龙江省考' &&
      data?.subject === '行测' &&
      data?.module === '资料分析' &&
      data?.difficulty === '中等' &&
      Array.isArray(data?.questions) &&
      data.questions.length === 3;
    end(ok, '空 body → 200 默认配置（黑龙江省考/行测/资料分析/中等/3 题）', `status=${status}, questions=${data?.questions?.length}`);
  }

  // 用例 7：B2 排除集 —— 新返回题干与 context.excludedQuestions 零交集
  {
    const first = await request('/api/generate', {
      method: 'POST',
      body: { module: '资料分析', count: 1 },
    });
    const excluded = [(first?.data?.questions?.[0]?.question ?? '')].filter(Boolean);
    const second = await request('/api/generate', {
      method: 'POST',
      body: { module: '资料分析', count: 2, context: { excludedQuestions: excluded } },
    });
    const ev = new Set(excluded.map((t) => String(t).trim()));
    const hit = (second?.data?.questions ?? []).filter((q) => ev.has(String(q.question).trim()));
    const ok =
      first.status === 200 &&
      second.status === 200 &&
      (second?.data?.questions?.length ?? 0) >= 1 &&
      hit.length === 0;
    end(ok, 'B2 排除集：context.excludedQuestions 与返回题干零交集', `排除 ${excluded.length} 题, 命中 ${hit.length}`);
  }

  // 用例 8：两次相同请求的题目 id 不同（全局唯一，防重复）
  {
    const body = { module: '资料分析', count: 1, difficulty: '中等' };
    const a = await request('/api/generate', { method: 'POST', body });
    const b = await request('/api/generate', { method: 'POST', body });
    const idA = a?.data?.questions?.[0]?.id;
    const idB = b?.data?.questions?.[0]?.id;
    const ok = a.status === 200 && b.status === 200 && typeof idA === 'string' && idA !== idB;
    end(ok, '两次相同请求的题目 id 不同（全局唯一）', `idA=${idA}, idB=${idB}`);
  }

  // 用例 9：Wave 12 扩容——count=10 出满 10 题且字段完整（Mock 每模块 10 题）
  {
    const { status, data } = await request('/api/generate', {
      method: 'POST',
      body: { module: '资料分析', count: 10 },
    });
    const bad = [];
    for (const q of data?.questions ?? []) {
      if (typeof q.question !== 'string' || !q.question.trim()) bad.push('题干为空');
      if (!['A', 'B', 'C', 'D'].every((k) => q?.options?.[k])) bad.push(`选项不齐:${q?.id}`);
      if (!['A', 'B', 'C', 'D'].includes(q.answer)) bad.push(`answer=${q.answer} 非法`);
    }
    const ok =
      status === 200 &&
      Array.isArray(data?.questions) &&
      data.questions.length === 10 &&
      bad.length === 0;
    end(ok, 'count=10 → 恰 10 题（Mock 扩容后出满）且字段完整', `status=${status}, questions=${data?.questions?.length}${bad.length ? ', ' + bad.join('、') : ''}`);
  }

  // 汇总：0 = 全部通过，非 0 = 存在失败
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n--- 原子测试汇总: PASS ${passed}/${results.length}${failed ? `, FAIL ${failed}` : ''} ---`);
  process.exitCode = failed > 0 ? 1 : 0;
}

try {
  await main();
} catch (err) {
  console.error('原子测试异常中断:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await sleep(300);
    try {
      process.kill(child.pid, 'SIGKILL');
    } catch {
      // 已退出
    }
  }
}