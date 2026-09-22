// 服务端入口：Express + 中间件 + 路由挂载（AGENTS.md §3 目录约定）
import express from 'express';
import cors from 'cors';

import { env } from './config/env.js';
import generateRouter from './routes/generate.js';
import explainRouter from './routes/explain.js';

const app = express();

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// 业务路由（Wave 1 占位，Wave 2 填充实现）
app.use('/api/generate', generateRouter);
app.use('/api/explain', explainRouter);

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
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

export default app;