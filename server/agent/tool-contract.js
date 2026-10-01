'use strict';

// 给你抽一张 · TA 的两只手（两个工具，权限分开）：
//   cards_tool 是维护的手：能翻开卡池看里面有什么、导入、改卡、重新洗牌。删卡、删卡池不给 TA，归 YOU 在设置页删。
//   draw_tool  是抽卡的手：只看得到卡池名字和还剩几张，抽中以后才知道是哪张。
// 这样 TA 给 YOU 抽卡的时候，没法先偷看再挑。
// 这两个对象是「工具描述 + handler」：name / description / inputSchema 交给你们的 Agent 运行时注册成工具，
// handler(input) 返回的结果原样给 TA 看。draw 的结果里带 delivery（kind:'cards'），
// 你们的宿主拿它在对话里画出 TA 抽的那几张卡（见 docs/INTEGRATION.md「TA 抽的卡怎么进对话」）。

const CARDS_TOOL_ID = 'cards_tool';
const DRAW_TOOL_ID = 'draw_tool';
const CATEGORY = 'cards';

const CARDS_TOOL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      enum: ['list_pools', 'read_pool', 'preview', 'import', 'create_pool', 'update_pool', 'add_card', 'update_card', 'reset_round', 'export'],
      description: 'list_pools=看有哪些卡池；read_pool=翻开一个卡池看全部卡（能看到内容，这是维护用的）；preview=导入前先试读一段文本，看认出几个卡池几张卡、哪行有问题，不写入；import=按卡池模板导入（text 或 json）；create_pool/update_pool=建、改卡池；add_card/update_card=加、改一张卡（删卡、删卡池归她，在设置页删）；reset_round=重新洗牌，这一轮抽过的全放回；export=导出 json 或 text。'
    },
    poolId: { type: 'string', maxLength: 80 },
    cardId: { type: 'string', maxLength: 80 },
    text: { type: 'string', maxLength: 300000, description: 'preview/import 用：卡池模板文本（# 卡池： / # 说明： / # 放回： / [标签] 正面 || 反面 ×权重）。' },
    json: { type: 'string', maxLength: 600000, description: 'import 用：draw-cards/1 格式的 JSON 字符串。' },
    mode: { enum: ['new', 'merge'], description: 'import 用：new=每个卡池都新建（重名自动编号），merge=并进同名卡池。默认 new。' },
    skipDuplicates: { type: 'boolean', description: 'import 用：重复的卡跳过，默认 true。' },
    name: { type: 'string', maxLength: 60 },
    description: { type: 'string', maxLength: 200 },
    icon: { type: 'string', maxLength: 200 },
    skinId: { type: 'string', maxLength: 80 },
    putBack: { type: 'boolean', description: '是否放回：true=每次从全部卡里抽（今天吃什么），false=一轮内不重复（真心话、单词）。' },
    tag: { type: 'string', maxLength: 20 },
    front: { type: 'string', maxLength: 500 },
    back: { type: 'string', maxLength: 1000 },
    weight: { type: 'integer', minimum: 1, maximum: 99 },
    search: { type: 'string', maxLength: 80, description: 'read_pool 可选：只看包含这个词的卡。' },
    offset: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1, maximum: 500 },
    format: { enum: ['json', 'text'] }
  }
});

const DRAW_TOOL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      enum: ['pools', 'draw', 'history', 'prefs'],
      description: 'pools=看能抽哪些卡池（只有名字、张数、剩几张、有哪些标签，看不到卡面）；draw=抽卡，抽出来的卡会作为卡片出现在对话里；history=最近抽过什么；prefs=看或改 TA 记住的抽卡设置（不传 poolId/for/count/tag 就是看）。'
    },
    poolId: { type: 'string', maxLength: 80, description: 'draw 用：从哪个卡池抽。不填就用 TA 记住的那个。' },
    for: { enum: ['you', 'ta'], description: 'draw 用：给谁抽。you=给 YOU 抽，ta=给 TA 自己抽。不填用记住的设置。' },
    count: { type: 'integer', minimum: 1, maximum: 5, description: 'draw 用：一次抽几张，1 到 5。' },
    tag: { type: 'string', maxLength: 20, description: 'draw 可选：只抽这个标签的卡，比如 真心话 / 大冒险。' },
    note: { type: 'string', maxLength: 300, description: 'draw 可选：随卡一起说的一句话。' },
    clientDrawId: { type: 'string', minLength: 8, maxLength: 80, description: 'draw 可选：幂等键，重试复用同一个值就不会多抽。' },
    limit: { type: 'integer', minimum: 1, maximum: 100 }
  }
});

function toolError(prefix, code, message) {
  const error = new Error(message || code);
  error.code = prefix + '_' + String(code || 'failed').replace(/^cards_/, '');
  error.knownToolOutcome = true;
  return error;
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCardsTool(options = {}) {
  const store = options.store;
  if (!store || typeof store.importText !== 'function') throw new TypeError('cards_tool requires the cards store');
  return Object.freeze({
    name: CARDS_TOOL_ID,
    title: '卡池维护',
    description: '维护 YOU 和 TA 共用的卡池（真心话大冒险、今天吃什么、单词卡……）。这只手能翻开卡池看里面有什么；真要抽卡用 draw_tool，那只手看不到卡面。',
        // 删除不给这只手：删东西归她。剩下的写操作重放安全（导入跳过重复、改是覆盖），所以不是高风险档。
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, capabilityCategory: CATEGORY }),
    inputSchema: CARDS_TOOL_INPUT_SCHEMA,
    async handler(input = {}) {
      const action = str(input.action);
      try {
        switch (action) {
          case 'list_pools': return { pools: store.listPools() };
          case 'read_pool': {
            const pool = store.getPool(str(input.poolId));
            const search = str(input.search);
            const all = search ? pool.cards.filter(card => (card.front + ' ' + card.back + ' ' + card.tag).includes(search)) : pool.cards;
            const offset = Math.max(0, Number(input.offset) || 0);
            const limit = Math.max(1, Math.min(500, Number(input.limit) || 200));
            return Object.assign({}, pool, { cards: all.slice(offset, offset + limit), total: all.length, offset });
          }
          case 'preview': return store.previewText(String(input.text || ''));
          case 'import': {
            const opts = { mode: input.mode, skipDuplicates: input.skipDuplicates, targetPoolId: str(input.poolId) || undefined, icon: input.icon, skinId: input.skinId };
            return input.json ? store.importJson(String(input.json), opts) : store.importText(String(input.text || ''), opts);
          }
          case 'create_pool': return { pool: store.createPool(input) };
          case 'update_pool': return { pool: store.updatePool(str(input.poolId), input) };
          case 'add_card': return { card: store.addCard(str(input.poolId), input) };
          case 'update_card': {
            const patch = {};
            for (const key of ['tag', 'front', 'back', 'weight']) if (input[key] !== undefined) patch[key] = input[key];
            return { card: store.updateCard(str(input.poolId), str(input.cardId), patch) };
          }
          case 'reset_round': return { pool: store.resetRound(str(input.poolId)) };
          case 'export': {
            const ids = str(input.poolId) ? [str(input.poolId)] : [];
            return { format: input.format === 'text' ? 'text' : 'json', content: store.exportPools(ids, input.format === 'text' ? 'text' : 'json') };
          }
          default: throw toolError('cards_tool', 'unknown_action', 'cards_tool 不认识这个 action: ' + (action || '(空)'));
        }
      } catch (error) {
        if (error && error.knownToolOutcome) throw error;
        throw toolError('cards_tool', error && error.message, 'cards_tool ' + action + ' 失败: ' + (error && error.message));
      }
    }
  });
}

function createDrawTool(options = {}) {
  const store = options.store;
  if (!store || typeof store.draw !== 'function') throw new TypeError('draw_tool requires the cards store');
  const onDraw = typeof options.onDraw === 'function' ? options.onDraw : null;
  return Object.freeze({
    name: DRAW_TOOL_ID,
    title: '抽卡',
    description: '从卡池里抽卡，给 YOU 抽或给 TA 自己抽。抽之前看不到卡面，抽中的卡会作为卡片出现在对话里，YOU 点一下翻面。',
        annotations: Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, capabilityCategory: CATEGORY }),
    inputSchema: DRAW_TOOL_INPUT_SCHEMA,
    async handler(input = {}) {
      const action = str(input.action);
      try {
        switch (action) {
          case 'pools': return { pools: store.listPools(), prefs: store.getPrefs('ta') };
          case 'prefs': {
            const patch = {};
            for (const key of ['poolId', 'for', 'count', 'tag']) if (input[key] !== undefined) patch[key] = input[key];
            return { prefs: Object.keys(patch).length ? store.setPrefs('ta', patch) : store.getPrefs('ta') };
          }
          case 'history': return { draws: store.listDraws({ limit: Math.max(1, Math.min(100, Number(input.limit) || 20)) }) };
          case 'draw': {
            const prefs = store.getPrefs('ta');
            const poolId = str(input.poolId) || prefs.poolId;
            if (!poolId) throw toolError('draw_tool', 'pool_required', '还没选卡池：先 pools 看一眼，再带 poolId 抽');
            const record = store.draw({
              poolId,
              by: 'ta',
              for: input.for || prefs.for,
              count: input.count || prefs.count,
              tag: input.tag !== undefined ? input.tag : prefs.tag,
              clientDrawId: str(input.clientDrawId) || null
            });
            if (onDraw) { try { onDraw({ draw: record }); } catch (hookError) { /* hook 失败不吞抽卡结果 */ } }
            return {
              draw: record,
              delivery: {
                kind: 'cards',
                drawId: record.id,
                poolId: record.poolId,
                poolName: record.poolName,
                skinId: record.skinId,
                by: 'ta',
                for: record.for,
                note: str(input.note).slice(0, 300),
                items: record.items,
                createdAt: record.createdAt
              }
            };
          }
          default: throw toolError('draw_tool', 'unknown_action', 'draw_tool 不认识这个 action: ' + (action || '(空)'));
        }
      } catch (error) {
        if (error && error.knownToolOutcome) throw error;
        throw toolError('draw_tool', error && error.message, 'draw_tool ' + action + ' 失败: ' + (error && error.message));
      }
    }
  });
}

module.exports = Object.freeze({
  CARDS_TOOL_ID, DRAW_TOOL_ID, CARDS_TOOL_INPUT_SCHEMA, DRAW_TOOL_INPUT_SCHEMA,
  createCardsTool, createDrawTool
});
