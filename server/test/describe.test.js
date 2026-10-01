'use strict';
const assert = require('assert');
const { resolveYouDraws, describeDraws } = require('../cards/describe');
const draws = {
  d1: { id: 'd1', by: 'you', for: 'ta', poolName: '真心话', items: [{ cardId: 'c', tag: '真心话', front: '你\n好', back: '', no: 3, of: 10 }] },
  d2: { id: 'd2', by: 'ta', for: 'you', poolName: '真心话', items: [{ front: 'x' }] },
  d3: { id: 'd3', by: 'you', for: 'you', poolName: '单词', items: [{ tag: '单词', front: 'linger', back: '逗留', no: 1, of: 3 }] }
};
const store = { getDraw(id) { if (!draws[id]) throw new Error('cards_draw_not_found'); return draws[id]; } };
const got = resolveYouDraws(store, ['d1', { drawId: 'd2' }, 'nope', 'd1', 'd3']);
assert.deepStrictEqual(got.map(d => d.drawId), ['d1', 'd3'], '只认 YOU 抽的、去重、找不到的跳过');
const text = describeDraws(got);
assert.ok(text.includes('[YOU给TA抽了 1 张卡（卡池：真心话）：'));
assert.ok(text.includes('第 3/10 张 [真心话] 你 好'));
assert.ok(text.includes('[YOU给自己抽了 1 张卡（卡池：单词）：'));
assert.ok(text.includes('linger ／ 反面：逗留'));
assert.deepStrictEqual(resolveYouDraws(store, 'd1'), []);
console.log('cards/describe ok');
