'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DRAW_CARDS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'draw-cards-routes-')), 'cards.json');
process.env.DRAW_CARDS_TOKEN = '';
const { app } = require('../example-server');

(async () => {
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  try {
    const preview = await call('POST', '/cards/preview', { text: '# 卡池：单词\nserendipity || 碰巧的好运\nlinger' });
    assert.strictEqual(preview.body.preview.cardCount, 2);
    const imported = await call('POST', '/cards/import', { text: '# 卡池：单词\nserendipity || 碰巧的好运\nlinger' });
    const poolId = imported.body.result.created[0].id;
    const drawn = await call('POST', '/cards/draw', { poolId, for: 'ta', count: 2, clientDrawId: 'routes-test-1' });
    assert.strictEqual(drawn.body.draw.by, 'you', '从接口抽的永远记成 YOU 抽的');
    assert.strictEqual(drawn.body.draw.items.length, 2);
    const voided = await call('POST', '/cards/draws/' + drawn.body.draw.id + '/void');
    assert.ok(voided.body.draw.voidedAt, '还没发出去的一手可以放回');
    const pool = await call('GET', '/cards/pools/' + poolId);
    assert.strictEqual(pool.body.pool.remaining, 2, '放回以后卡回到这一轮');
    const missing = await call('GET', '/cards/pools/nope');
    assert.strictEqual(missing.status, 404);
    console.log('routes ok');
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
