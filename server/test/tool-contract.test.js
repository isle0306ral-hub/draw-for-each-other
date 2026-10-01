'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DRAW_CARDS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'draw-cards-tool-')), 'cards.json');
const store = require('../cards/store');
const { createCardsTool, createDrawTool } = require('../agent/tool-contract');


(async () => {
  const cards = createCardsTool({ store });
  const draw = createDrawTool({ store });
  assert.strictEqual(cards.name, 'cards_tool');
  assert.strictEqual(draw.name, 'draw_tool');
  assert.ok(!cards.inputSchema.properties.action.enum.includes('delete_pool'), 'TA 的维护手不能删卡池');
  const imported = await cards.handler({ action: 'import', text: '# 卡池：真心话\n[真心话] 第一题\n[真心话] 第二题' });
  const poolId = imported.created[0].id;
  const pools = await draw.handler({ action: 'pools' });
  assert.ok(!JSON.stringify(pools).includes('第一题'), '抽卡的手看不到卡面');
  const got = await draw.handler({ action: 'draw', poolId, for: 'you', count: 1, note: '给你' });
  assert.strictEqual(got.delivery.kind, 'cards');
  assert.strictEqual(got.delivery.by, 'ta');
  assert.strictEqual(got.delivery.for, 'you');
  assert.strictEqual(got.delivery.note, '给你');
  assert.strictEqual(got.delivery.items.length, 1);
  console.log('tool-contract ok');
})().catch(error => { console.error(error); process.exit(1); });
