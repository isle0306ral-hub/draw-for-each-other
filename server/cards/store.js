'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LIMITS, TAG_RE, parseCardText, parseCardJson, poolsToJson, poolsToText } = require('./parse');

// 卡池、抽卡记录、两个人各自记住的抽卡设置，都在一个 JSON 文件里。
// 抽卡是盲的：draw 只在抽中之后才把卡面交出来；listPools 只给名字、张数和标签统计。
// 两个人：you 是人，ta 是 TA（你的 AI 伴侣）。
const ACTORS = Object.freeze(['ta', 'you']);
const DRAW_COUNT_MAX = 5;
const DRAWS_KEEP = 3000;

function defaultFile() {
  return process.env.DRAW_CARDS_FILE || path.join(process.env.DRAW_CARDS_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'cards.json');
}

function emptyState() {
  return { version: 1, pools: [], draws: [], prefs: {}, skins: [] };
}

function read(file = defaultFile()) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object') return emptyState();
    return {
      version: 1,
      pools: Array.isArray(value.pools) ? value.pools : [],
      draws: Array.isArray(value.draws) ? value.draws : [],
      prefs: value.prefs && typeof value.prefs === 'object' ? value.prefs : {},
      skins: Array.isArray(value.skins) ? value.skins : []
    };
  } catch {
    return emptyState();
  }
}

function write(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function makeId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function text(value, max) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function findPool(state, poolId) {
  const pool = state.pools.find(item => item.id === String(poolId || ''));
  if (!pool) throw fail('cards_pool_not_found');
  if (!pool.round || typeof pool.round !== 'object') pool.round = { n: 1, drawnIds: [] };
  if (!Array.isArray(pool.round.drawnIds)) pool.round.drawnIds = [];
  if (!Array.isArray(pool.cards)) pool.cards = [];
  return pool;
}

function tagCounts(cards) {
  const counts = {};
  for (const card of cards) {
    const key = card.tag || '';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function remainingOf(pool) {
  if (pool.putBack) return pool.cards.length;
  const drawn = new Set((pool.round && pool.round.drawnIds) || []);
  return pool.cards.filter(card => !drawn.has(card.id)).length;
}

// 给抽卡这一侧看的：没有任何卡面内容。
function poolSummary(pool) {
  return {
    id: pool.id,
    name: pool.name,
    description: pool.description || '',
    icon: pool.icon || '',
    skinId: pool.skinId || '',
    putBack: !!pool.putBack,
    count: (pool.cards || []).length,
    remaining: remainingOf(pool),
    round: (pool.round && pool.round.n) || 1,
    tags: tagCounts(pool.cards || []),
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt
  };
}

function normalizeCard(input, existing) {
  const base = existing || {};
  let front = input.front !== undefined ? text(input.front, LIMITS.front) : base.front;
  let tagInput = input.tag;
  // 标签框空着、题目开头写了 [真心话] / ［真心话］ 的，把标签拆出来，跟导入一个规矩。
  if (input.front !== undefined && !text(tagInput || '', LIMITS.tag) && front) {
    const m = front.match(TAG_RE);
    if (m && m[1].trim() && front.slice(m[0].length).trim()) { tagInput = m[1].trim(); front = front.slice(m[0].length).trim(); }
  }
  if (!front) throw fail('cards_front_required');
  const weightRaw = input.weight !== undefined ? Number(input.weight) : (base.weight || 1);
  const weight = Number.isFinite(weightRaw) ? Math.max(1, Math.min(LIMITS.weightMax, Math.floor(weightRaw))) : 1;
  return {
    id: base.id || makeId('card'),
    tag: tagInput !== undefined ? text(tagInput, LIMITS.tag).replace(/[\[\]［］【】]/g, '') : (base.tag || ''),
    front,
    back: input.back !== undefined ? text(input.back, LIMITS.back) : (base.back || ''),
    weight,
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function listPools(file = defaultFile()) {
  return read(file).pools.map(poolSummary);
}

function getPool(poolId, file = defaultFile()) {
  const pool = findPool(read(file), poolId);
  return Object.assign(poolSummary(pool), { cards: pool.cards.slice(), drawnIds: pool.putBack ? [] : pool.round.drawnIds.slice() });
}

function uniqueName(state, name) {
  const taken = new Set(state.pools.map(pool => pool.name));
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = name + '（' + i + '）';
    if (!taken.has(candidate)) return candidate;
  }
  return name + '（' + Date.now() + '）';
}

function newPool(state, input) {
  const name = text(input.name, LIMITS.name);
  if (!name) throw fail('cards_pool_name_required');
  const nowIso = new Date().toISOString();
  return {
    id: makeId('pool'),
    name: uniqueName(state, name),
    description: text(input.description, LIMITS.description),
    icon: text(input.icon, 200),
    skinId: text(input.skinId, 80),
    putBack: !!input.putBack,
    cards: [],
    round: { n: 1, drawnIds: [] },
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function createPool(input = {}, file = defaultFile()) {
  const state = read(file);
  const pool = newPool(state, input);
  state.pools.push(pool);
  write(file, state);
  return poolSummary(pool);
}

function updatePool(poolId, patch = {}, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  if (patch.name !== undefined) {
    const name = text(patch.name, LIMITS.name);
    if (!name) throw fail('cards_pool_name_required');
    if (name !== pool.name) pool.name = uniqueName(state, name);
  }
  if (patch.description !== undefined) pool.description = text(patch.description, LIMITS.description);
  if (patch.icon !== undefined) pool.icon = text(patch.icon, 200);
  if (patch.skinId !== undefined) pool.skinId = text(patch.skinId, 80);
  if (patch.putBack !== undefined) pool.putBack = !!patch.putBack;
  pool.updatedAt = new Date().toISOString();
  write(file, state);
  return poolSummary(pool);
}

function deletePool(poolId, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  state.pools = state.pools.filter(item => item !== pool);
  for (const actor of ACTORS) {
    if (state.prefs[actor] && state.prefs[actor].poolId === pool.id) state.prefs[actor].poolId = '';
  }
  write(file, state);
  return { deleted: pool.id, name: pool.name };
}

function addCard(poolId, input = {}, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  if (pool.cards.length >= LIMITS.cardsPerPool) throw fail('cards_pool_full');
  const card = normalizeCard(input);
  pool.cards.push(card);
  pool.updatedAt = card.updatedAt;
  write(file, state);
  return card;
}

function updateCard(poolId, cardId, patch = {}, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  const index = pool.cards.findIndex(card => card.id === String(cardId || ''));
  if (index < 0) throw fail('cards_card_not_found');
  pool.cards[index] = normalizeCard(patch, pool.cards[index]);
  pool.updatedAt = pool.cards[index].updatedAt;
  write(file, state);
  return pool.cards[index];
}

function deleteCard(poolId, cardId, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  const before = pool.cards.length;
  pool.cards = pool.cards.filter(card => card.id !== String(cardId || ''));
  if (pool.cards.length === before) throw fail('cards_card_not_found');
  pool.round.drawnIds = pool.round.drawnIds.filter(id => id !== String(cardId));
  pool.updatedAt = new Date().toISOString();
  write(file, state);
  return { deleted: String(cardId) };
}

function resetRound(poolId, file = defaultFile()) {
  const state = read(file);
  const pool = findPool(state, poolId);
  pool.round = { n: (pool.round.n || 1) + 1, drawnIds: [] };
  pool.updatedAt = new Date().toISOString();
  write(file, state);
  return poolSummary(pool);
}

// mode: 'new' 每个卡池都新建（重名自动加编号）；'merge' 同名卡池并进去，没有就新建；
// targetPoolId 给了就全部并进那一个卡池。skipDuplicates 默认 true：和已有卡或文件里前面的卡重复的跳过。
function applyParsed(parsed, options, file) {
  const state = read(file);
  const mode = options.mode === 'merge' ? 'merge' : 'new';
  const skipDuplicates = options.skipDuplicates !== false;
  const result = { created: [], merged: [], added: 0, skipped: 0, warnings: parsed.warnings };
  for (const parsedPool of parsed.pools) {
    let pool = null;
    if (options.targetPoolId) pool = findPool(state, options.targetPoolId);
    else if (mode === 'merge') pool = state.pools.find(item => item.name === parsedPool.name) || null;
    const isNew = !pool;
    if (isNew) {
      pool = newPool(state, { name: parsedPool.name, description: parsedPool.description, putBack: parsedPool.putBack, icon: options.icon, skinId: options.skinId });
      pool.round = { n: 1, drawnIds: [] };
      state.pools.push(pool);
    } else {
      findPool(state, pool.id);
    }
    const keys = new Set(pool.cards.map(card => (card.tag || '') + '\u0000' + card.front));
    for (const parsedCard of parsedPool.cards) {
      const key = (parsedCard.tag || '') + '\u0000' + parsedCard.front;
      if (skipDuplicates && keys.has(key)) { result.skipped++; continue; }
      if (pool.cards.length >= LIMITS.cardsPerPool) { result.skipped++; continue; }
      pool.cards.push(normalizeCard(parsedCard));
      keys.add(key);
      result.added++;
    }
    pool.updatedAt = new Date().toISOString();
    (isNew ? result.created : result.merged).push(poolSummary(pool));
  }
  write(file, state);
  return result;
}

function importText(source, options = {}, file = defaultFile()) {
  const parsed = parseCardText(source);
  if (!parsed.pools.length) throw fail('cards_import_empty');
  return applyParsed(parsed, options, file);
}

function importJson(source, options = {}, file = defaultFile()) {
  const parsed = parseCardJson(source);
  if (!parsed.pools.length) throw fail('cards_import_empty');
  return applyParsed(parsed, options, file);
}

function previewText(source) {
  const parsed = parseCardText(source);
  return {
    pools: parsed.pools.map(pool => ({ name: pool.name, description: pool.description, putBack: pool.putBack, count: pool.cards.length, tags: tagCounts(pool.cards) })),
    cardCount: parsed.cardCount,
    duplicateCount: parsed.duplicateCount,
    warnings: parsed.warnings
  };
}

function exportPools(poolIds, format = 'json', file = defaultFile()) {
  const state = read(file);
  const wanted = Array.isArray(poolIds) && poolIds.length ? new Set(poolIds.map(String)) : null;
  const pools = state.pools.filter(pool => !wanted || wanted.has(pool.id));
  return format === 'text' ? poolsToText(pools) : poolsToJson(pools);
}

function weightedPick(cards) {
  let total = 0;
  for (const card of cards) total += Math.max(1, Number(card.weight) || 1);
  let roll = crypto.randomInt(total);
  for (let i = 0; i < cards.length; i++) {
    roll -= Math.max(1, Number(cards[i].weight) || 1);
    if (roll < 0) return i;
  }
  return cards.length - 1;
}

function draw(input = {}, file = defaultFile()) {
  const by = String(input.by || '');
  const target = String(input.for || '');
  if (!ACTORS.includes(by)) throw fail('cards_draw_by_invalid');
  if (!ACTORS.includes(target)) throw fail('cards_draw_for_invalid');
  const count = Math.max(1, Math.min(DRAW_COUNT_MAX, Math.floor(Number(input.count) || 1)));
  const clientDrawId = input.clientDrawId ? String(input.clientDrawId).slice(0, 80) : null;
  const state = read(file);
  if (clientDrawId) {
    const existing = state.draws.find(item => item.clientDrawId === clientDrawId && item.by === by);
    if (existing) return existing;
  }
  const pool = findPool(state, input.poolId);
  const tag = input.tag ? text(input.tag, LIMITS.tag) : '';
  const candidates = pool.cards.filter(card => !tag || (card.tag || '') === tag);
  if (!candidates.length) throw fail(tag ? 'cards_no_cards_with_tag' : 'cards_pool_empty');
  const picks = [];
  let reshuffled = false;
  const pickedIds = new Set();
  while (picks.length < count) {
    let available = candidates.filter(card => !pickedIds.has(card.id));
    if (!pool.putBack) {
      const drawn = new Set(pool.round.drawnIds);
      const fresh = available.filter(card => !drawn.has(card.id));
      if (!fresh.length) {
        const candidateIds = new Set(candidates.map(card => card.id));
        pool.round = { n: (pool.round.n || 1) + 1, drawnIds: pool.round.drawnIds.filter(id => !candidateIds.has(id) || pickedIds.has(id)) };
        reshuffled = true;
        available = candidates.filter(card => !pickedIds.has(card.id));
      } else {
        available = fresh;
      }
    }
    if (!available.length) break;
    const card = available[weightedPick(available)];
    pickedIds.add(card.id);
    if (!pool.putBack) pool.round.drawnIds.push(card.id);
    picks.push(card);
  }
  pool.drawTotal = (Number(pool.drawTotal) || 0) + picks.length;
  const drawnInRound = pool.putBack ? 0 : pool.round.drawnIds.filter(id => candidates.some(card => card.id === id)).length;
  const record = {
    id: makeId('draw'),
    clientDrawId,
    poolId: pool.id,
    poolName: pool.name,
    skinId: pool.skinId || '',
    putBack: !!pool.putBack,
    tag,
    by,
    for: target,
    reshuffled,
    items: picks.map((card, index) => ({
      cardId: card.id,
      tag: card.tag || '',
      front: card.front,
      back: card.back || '',
      no: pool.putBack ? pool.drawTotal - picks.length + index + 1 : drawnInRound - picks.length + index + 1,
      of: pool.putBack ? null : candidates.length
    })),
    remaining: remainingOf(pool),
    createdAt: new Date().toISOString()
  };
  state.draws.push(record);
  if (state.draws.length > DRAWS_KEEP) state.draws = state.draws.slice(-DRAWS_KEEP);
  write(file, state);
  return record;
}

function listDraws(options = {}, file = defaultFile()) {
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 30));
  const poolId = options.poolId ? String(options.poolId) : '';
  return read(file).draws.filter(item => !poolId || item.poolId === poolId).slice(-limit).reverse();
}

function getDraw(drawId, file = defaultFile()) {
  const found = read(file).draws.find(item => item.id === String(drawId || ''));
  if (!found) throw fail('cards_draw_not_found');
  return found;
}

// YOU 抽了还没发出去的那一手，可以退回去重抽：卡放回这一轮，这次抽卡作废。发出去的不能退。
function voidDraw(drawId, by, file = defaultFile()) {
  const state = read(file);
  const record = state.draws.find(item => item.id === String(drawId || ''));
  if (!record) throw fail('cards_draw_not_found');
  if (record.by !== by) throw fail('cards_draw_not_yours');
  if (record.sentAt) throw fail('cards_draw_already_sent');
  if (record.voidedAt) return record;
  const pool = state.pools.find(item => item.id === record.poolId);
  if (pool) {
    const ids = new Set(record.items.map(item => item.cardId));
    if (!pool.putBack && pool.round && Array.isArray(pool.round.drawnIds)) pool.round.drawnIds = pool.round.drawnIds.filter(id => !ids.has(id));
    pool.drawTotal = Math.max(0, (Number(pool.drawTotal) || 0) - record.items.length);
  }
  record.voidedAt = new Date().toISOString();
  write(file, state);
  return record;
}

function markDrawsSent(drawIds, file = defaultFile()) {
  const wanted = new Set((drawIds || []).map(String));
  if (!wanted.size) return;
  const state = read(file);
  let changed = false;
  for (const record of state.draws) {
    if (wanted.has(record.id) && !record.sentAt) { record.sentAt = new Date().toISOString(); changed = true; }
  }
  if (changed) write(file, state);
}

function getPrefs(actor, file = defaultFile()) {
  if (!ACTORS.includes(actor)) throw fail('cards_actor_invalid');
  const prefs = read(file).prefs[actor] || {};
  return { poolId: prefs.poolId || '', tag: prefs.tag || '', for: ACTORS.includes(prefs.for) ? prefs.for : (actor === 'you' ? 'ta' : 'you'), count: Math.max(1, Math.min(DRAW_COUNT_MAX, Number(prefs.count) || 1)) };
}

function setPrefs(actor, patch = {}, file = defaultFile()) {
  if (!ACTORS.includes(actor)) throw fail('cards_actor_invalid');
  const state = read(file);
  const current = state.prefs[actor] || {};
  if (patch.poolId !== undefined) {
    if (patch.poolId) findPool(state, patch.poolId);
    current.poolId = String(patch.poolId || '');
  }
  if (patch.tag !== undefined) current.tag = text(patch.tag, LIMITS.tag);
  if (patch.for !== undefined) {
    if (!ACTORS.includes(String(patch.for))) throw fail('cards_draw_for_invalid');
    current.for = String(patch.for);
  }
  if (patch.count !== undefined) current.count = Math.max(1, Math.min(DRAW_COUNT_MAX, Math.floor(Number(patch.count) || 1)));
  state.prefs[actor] = current;
  write(file, state);
  return getPrefs(actor, file);
}

module.exports = Object.freeze({
  ACTORS, DRAW_COUNT_MAX, defaultFile, read, write, poolSummary,
  listPools, getPool, createPool, updatePool, deletePool,
  addCard, updateCard, deleteCard, resetRound,
  importText, importJson, previewText, exportPools,
  draw, voidDraw, markDrawsSent, listDraws, getDraw, getPrefs, setPrefs
});
