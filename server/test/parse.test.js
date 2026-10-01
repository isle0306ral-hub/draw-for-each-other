'use strict';
const assert = require('assert');
const { parseCardText, parseCardJson, poolsToJson } = require('../cards/parse');

const r = parseCardText([
  '// 注释',
  '[孤儿] 前面没有卡池',
  '#卡池:半角冒号也认',
  '# 放回：随便',
  '[真心话]',
  '[真心话]   你好',
  '[真心话] 你好',
  'max 是一个词 x 不该被当权重',
  '火锅 ×3',
  '火锅 *0',
  '火锅*2 没空格不算权重',
  'a || b || c',
  '# 奇怪：行',
  '# 卡池：',
  '# 卡池：空的'
].join('\r\n'));
assert.strictEqual(r.pools.length, 2);
assert.strictEqual(r.pools[0].name, '半角冒号也认');
assert.strictEqual(r.pools[0].putBack, false);
const codes = r.warnings.map(w => w.code);
['card_before_pool', 'put_back_invalid', 'front_missing', 'duplicate', 'weight_out_of_range', 'extra_separator', 'unknown_header', 'pool_name_missing', 'pool_empty'].forEach(c => assert.ok(codes.includes(c), c));
const cards = r.pools[0].cards;
assert.strictEqual(cards[0].front, '你好');
assert.strictEqual(cards[1].duplicate, true);
assert.strictEqual(cards[2].front, 'max 是一个词 x 不该被当权重');
assert.strictEqual(cards[2].weight, 1);
assert.strictEqual(cards[3].weight, 3);
assert.strictEqual(cards[4].weight, 1);
assert.strictEqual(cards[5].front, '火锅*2 没空格不算权重');
assert.strictEqual(cards[6].front, 'a');
assert.strictEqual(cards[6].back, 'b || c');
assert.strictEqual(r.duplicateCount, 2); // 你好 两次、火锅 两次

const round = parseCardJson(poolsToJson([{ name: '单词', putBack: false, cards: [{ tag: '单词', front: 'linger', back: '逗留\n徘徊', weight: 2 }] }]));
assert.strictEqual(round.pools[0].cards[0].back, '逗留\n徘徊');
assert.strictEqual(round.pools[0].cards[0].weight, 2);
assert.throws(() => parseCardJson('{oops'), /cards_json_invalid/);
console.log('cards/parse ok');
