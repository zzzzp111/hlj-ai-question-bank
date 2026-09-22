// 服务端入口：Express + 中间件 + 路由挂载（AGENTS.md §3 目录约定）
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { env } from './config/env.js';
import generateRouter from './routes/generate.js';
import explainRouter from './routes/explain.js';

const app = express();

// P1-5：CORS 白名单可控——未配置 CORS_ORIGIN 时保持宽松（开发/演示零配置）；
// 配置后仅接受逗号分隔的白名单来源；生产同源托管（方案 A）无需配置。
const corsOrigin = env.corsOrigin
  ? env.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  : '*';
app.use(cors(corsOrigin === '*' ? {} : { origin: corsOrigin }));
app.use(express.json({ limit: env.bodyLimit }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// 业务路由（Wave 1 占位，Wave 2 填充实现）
app.use('/api/generate', generateRouter);
app.use('/api/explain', explainRouter);

// P0-2（方案 A）：生产同源托管 web/dist —— 仅当构建产物存在时挂载；
// 放在 /api 路由之后、404 中间件之前；非 /api 未匹配 GET 回退 index.html（SPA），
// /api/* 未匹配仍保持 JSON 404 契约（不被 SPA 回退吃掉）。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log(`[server] 已托管 web/dist（同源生产模式），浏览器访问 http://localhost:${env.port}`);
} else {
  console.log(`[server] 未发现 web/dist，跳过静态托管（开发模式请用 vite dev，访问 http://localhost:5173）`);
}

// json 404 兜底：未匹配路由统一返回数据结构（保证错误契约成立）
app.use((req, res) => {
  res.status(404).json({ error: { code: 404, message: '接口不存在' } });
});

// 全局错误中间件：统一返回 { error: { code, message } }（DATA_SCHEMA.md §5）
// err.status 可取 400/500 等；未带状态码的异常统一按 500 处理
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-unused-vars
  void next;
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const message =
    err?.expose === false
      ? '服务异常，请稍后重试'
      : err?.message || '服务异常，请稍后重试';
  res.status(status).json({ error: { code: status, message } });
});

// 仅当直接以 node 运行时监听，便于测试可导入而不占用端口
if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, () => {
    // P0-5 加分：启动日志输出版本身份与模式，便于 Windows 部署现场一眼确认状态
    console.log(`[server] listening on http://localhost:${env.port} | node ${process.version} | model=${env.llmModel || '(未配置)'} | mode=${env.llmApiKey ? 'real' : 'MOCK'}`);
  });
}

export default app;