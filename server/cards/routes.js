'use strict';
// 给你抽一张 · 卡池的 HTTP 接口（YOU 那一侧用：设置页维护卡池、聊天页抽卡）。
// mountCardsRoutes(router, store) 挂上来以后，路径都带 /cards 前缀，例如 router 挂在 /api 下就是 /api/cards/*。
// 鉴权不在这里做：外面包你们宿主自己的鉴权（见 server/example-server.js）。
// 设置页能看见卡池内容（维护用）；聊天里抽卡走 POST /cards/draw，抽中以后才交出卡面。

const BAD_REQUEST = /^cards_(pool_name_required|front_required|pool_full|import_empty|json_invalid|draw_for_invalid|draw_by_invalid|no_cards_with_tag|pool_empty|actor_invalid|draw_not_yours|draw_already_sent)$/;

function mountCardsRoutes(router, store) {
  if (!router || !store) throw new TypeError('mountCardsRoutes(router, store)');
  const route = handler => (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return res.json(Object.assign({ ok: true }, handler(req.body || {}, req)));
    } catch (error) {
      const code = String(error && error.message || 'cards_failed');
      if (/_not_found$/.test(code)) return res.status(404).json({ ok: false, error: code });
      if (BAD_REQUEST.test(code)) return res.status(400).json({ ok: false, error: code });
      console.warn('[draw-cards]', code);
      return res.status(500).json({ ok: false, error: 'cards_failed' });
    }
  };
  const id = value => String(value || '');

  // 卡池
  router.get('/cards/pools', route(() => ({ pools: store.listPools(), prefs: store.getPrefs('you') })));
  router.get('/cards/pools/:poolId', route((body, req) => ({ pool: store.getPool(id(req.params.poolId)) })));
  router.post('/cards/pools', route(body => ({ pool: store.createPool(body) })));
  router.patch('/cards/pools/:poolId', route((body, req) => ({ pool: store.updatePool(id(req.params.poolId), body) })));
  router.delete('/cards/pools/:poolId', route((body, req) => store.deletePool(id(req.params.poolId))));
  router.post('/cards/pools/:poolId/reset', route((body, req) => ({ pool: store.resetRound(id(req.params.poolId)) })));

  // 卡
  router.post('/cards/pools/:poolId/cards', route((body, req) => ({ card: store.addCard(id(req.params.poolId), body) })));
  router.patch('/cards/pools/:poolId/cards/:cardId', route((body, req) => {
    const patch = {};
    for (const key of ['tag', 'front', 'back', 'weight']) if (body[key] !== undefined) patch[key] = body[key];
    return { card: store.updateCard(id(req.params.poolId), id(req.params.cardId), patch) };
  }));
  router.delete('/cards/pools/:poolId/cards/:cardId', route((body, req) => store.deleteCard(id(req.params.poolId), id(req.params.cardId))));

  // 导入 / 导出（导入先 preview 再 import；规则见 web/cards/cards-template.txt）
  router.post('/cards/preview', route(body => ({ preview: store.previewText(String(body.text || '')) })));
  router.post('/cards/import', route(body => {
    const opts = { mode: body.mode, skipDuplicates: body.skipDuplicates, targetPoolId: body.targetPoolId || undefined, icon: body.icon };
    return { result: body.json ? store.importJson(typeof body.json === 'string' ? body.json : JSON.stringify(body.json), opts) : store.importText(String(body.text || ''), opts) };
  }));
  router.get('/cards/export', route((body, req) => {
    const ids = String(req.query && req.query.poolId || '').split(',').map(item => item.trim()).filter(Boolean);
    const format = req.query && req.query.format === 'text' ? 'text' : 'json';
    return { format, content: store.exportPools(ids, format) };
  }));

  // YOU 的抽卡偏好（常驻的卡池 / 给谁 / 几张 / 只抽哪个标签）
  router.get('/cards/prefs', route(() => ({ prefs: store.getPrefs('you') })));
  router.put('/cards/prefs', route(body => ({ prefs: store.setPrefs('you', body) })));

  // 抽卡：服务器抽（权重、不放回都在这边），by 钉死是 you，前端没法替 TA 抽
  router.get('/cards/draws', route((body, req) => ({ draws: store.listDraws({ limit: Number(req.query && req.query.limit) || 30, poolId: req.query && req.query.poolId }) })));
  router.post('/cards/draw', route(body => {
    const prefs = store.getPrefs('you');
    return { draw: store.draw({
      poolId: body.poolId || prefs.poolId,
      by: 'you',
      for: body.for || prefs.for,
      count: body.count || prefs.count,
      tag: body.tag !== undefined ? body.tag : prefs.tag,
      clientDrawId: body.clientDrawId
    }) };
  }));
  // 抽了还没发出去的那一手：放回 / 重抽前先作废（卡回到这一轮）。发出去的不能退。
  router.post('/cards/draws/:drawId/void', route((body, req) => ({ draw: store.voidDraw(id(req.params.drawId), 'you') })));
  return router;
}

module.exports = { mountCardsRoutes };
