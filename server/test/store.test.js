'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../cards/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draw-cards-'));
const file = path.join(dir, 'cards.json');
try {
  const src = [
    '# 卡池：真心话', '# 放回：否',
    '[真心话] A', '[真心话] B', '[大冒险] C', '[大冒险] D',
    '# 卡池：吃什么', '# 放回：是',
    '麻辣烫 ×50', '牛肉粉'
  ].join('\n');
  const imported = store.importText(src, {}, file);
  assert.strictEqual(imported.created.length, 2);
  assert.strictEqual(imported.added, 6);
  const [truth, food] = store.listPools(file);
  assert.strictEqual(truth.count, 4);
  assert.strictEqual(truth.remaining, 4);
  assert.deepStrictEqual(truth.tags, { '真心话': 2, '大冒险': 2 });
  assert.ok(!('cards' in truth), 'listPools 不能带卡面');

  // 不放回：一轮四张不重复，第五张自动洗牌
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const d = store.draw({ poolId: truth.id, by: 'you', for: 'ta' }, file);
    assert.strictEqual(d.items.length, 1);
    assert.ok(!seen.has(d.items[0].front), '同一轮抽到重复');
    seen.add(d.items[0].front);
    assert.strictEqual(d.items[0].no, i + 1);
    assert.strictEqual(d.items[0].of, 4);
  }
  assert.strictEqual(store.listPools(file)[0].remaining, 0);
  const fifth = store.draw({ poolId: truth.id, by: 'ta', for: 'you' }, file);
  assert.strictEqual(fifth.reshuffled, true);
  assert.strictEqual(fifth.items[0].no, 1);

  // 按标签抽 + 一次多张不重复
  const dare = store.draw({ poolId: truth.id, by: 'you', for: 'you', tag: '大冒险', count: 2 }, file);
  assert.strictEqual(dare.items.length, 2);
  assert.ok(dare.items.every(item => item.tag === '大冒险'));
  assert.notStrictEqual(dare.items[0].front, dare.items[1].front);
  assert.throws(() => store.draw({ poolId: truth.id, by: 'you', for: 'ta', tag: '没有' }, file), /cards_no_cards_with_tag/);

  // 放回 + 权重：麻辣烫 ×50 应该压倒性地多
  let mala = 0;
  for (let i = 0; i < 200; i++) {
    if (store.draw({ poolId: food.id, by: 'you', for: 'you' }, file).items[0].front === '麻辣烫') mala++;
  }
  assert.ok(mala > 170, 'weight not applied: ' + mala);
  assert.strictEqual(store.listPools(file)[1].remaining, 2);

  // 幂等
  const a = store.draw({ poolId: food.id, by: 'ta', for: 'you', clientDrawId: 'same-key-1' }, file);
  const b = store.draw({ poolId: food.id, by: 'ta', for: 'you', clientDrawId: 'same-key-1' }, file);
  assert.strictEqual(a.id, b.id);

  // 并入同名卡池，重复跳过
  const merged = store.importText('# 卡池：吃什么\n牛肉粉\n火锅 ×2', { mode: 'merge' }, file);
  assert.strictEqual(merged.merged.length, 1);
  assert.strictEqual(merged.added, 1);
  assert.strictEqual(merged.skipped, 1);

  // 增删改、重置、偏好、导出
  const card = store.addCard(truth.id, { tag: '真心话', front: '新题' }, file);
  store.updateCard(truth.id, card.id, { back: '反面' }, file);
  assert.strictEqual(store.getPool(truth.id, file).cards.find(c => c.id === card.id).back, '反面');
  store.deleteCard(truth.id, card.id, file);
  assert.strictEqual(store.resetRound(truth.id, file).remaining, 4);
  assert.deepStrictEqual(store.setPrefs('you', { poolId: truth.id, count: 9, for: 'ta' }, file), { poolId: truth.id, tag: '', for: 'ta', count: 5 });
  assert.strictEqual(store.getPrefs('ta', file).for, 'you');
  const exported = store.exportPools([], 'json', file);
  assert.strictEqual(exported.format, 'draw-cards/1');
  assert.strictEqual(exported.pools.length, 2);
  assert.ok(store.exportPools([food.id], 'text', file).includes('火锅 ×2'));
  assert.ok(store.listDraws({ limit: 5 }, file).length === 5);
  store.deletePool(food.id, file);
  assert.strictEqual(store.listPools(file).length, 1);
  console.log('cards/store ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
