'use strict';
// 给你抽一张 · 最小接线示例：一个 express 服务，把前端演示页和 /api/cards 挂起来。
// 你已经有自己的宿主（聊天页、Agent 运行时）的话，照这个样子把三件事接进去就行：
//   1) mountCardsRoutes(router, store) 挂到某个前缀下（默认 /api），外面包你自己的鉴权
//   2) 把 web/ 当静态文件发出去，或者把 web/cards/ 拷进你的前端
//   3) 把 agent/tool-contract.js 里的 cards_tool / draw_tool 注册成 TA 的工具；
//      YOU 发消息时带上的 cards（drawId 列表）用 cards/describe.js 并进 TA 收到的文字
const path = require('path');
const express = require('express');
const store = require('./cards/store');
const { mountCardsRoutes } = require('./cards/routes');

const PORT = Number(process.env.PORT) || 8788;
const TOKEN = process.env.DRAW_CARDS_TOKEN || '';      // 访问口令：前端放在 localStorage 'draw-cards.token'
if (!TOKEN) console.warn('[draw-cards] 没设 DRAW_CARDS_TOKEN：任何人都能改你的卡池，只建议本机试用');

const app = express();
app.use(express.json({ limit: '5mb' }));               // 导入整本题库时文本会比较大
app.use(express.static(path.join(__dirname, '..', 'web')));

const router = express.Router();
router.use((req, res, next) => {
  if (!TOKEN) return next();
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (got !== TOKEN) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: '口令不对' });
  next();
});
mountCardsRoutes(router, store);

// 演示页的「让 TA 抽一张」：替 TA 调一次 draw_tool。只给演示页用；接进你们自己的宿主时不需要它，
// 那边是 TA 自己调 draw_tool。设 DRAW_CARDS_DEMO=0 关掉。
if (process.env.DRAW_CARDS_DEMO !== '0') {
  const { createDrawTool } = require('./agent/tool-contract');
  const drawTool = createDrawTool({ store });
  router.post('/demo/ta-draw', async (req, res) => {
    try {
      const pools = store.listPools();
      const pool = pools.find(item => item.count > 0);
      if (!pool) return res.status(400).json({ ok: false, error: 'cards_pool_empty', message: '还没有卡池' });
      const result = await drawTool.handler({ action: 'draw', poolId: pool.id, for: 'you', count: 1, note: '给你抽了一张。' });
      res.json({ ok: true, delivery: result.delivery });
    } catch (error) { res.status(400).json({ ok: false, error: error.code || 'failed', message: error.message }); }
  });
}
app.use('/api', router); // 最终是 /api/cards/*

if (require.main === module) app.listen(PORT, () => console.log('[draw-cards] http://localhost:' + PORT + '/'));
module.exports = { app, store };
