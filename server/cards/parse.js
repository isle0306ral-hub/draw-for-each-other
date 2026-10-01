'use strict';

// 卡池导入：系统按行规则确定性识别，不经过任何模型。规则和
// /opt/ke/cards/卡池导入模板.txt（v3）逐条对应，改这里要同步改模板。

const LIMITS = Object.freeze({ name: 60, description: 200, tag: 20, front: 500, back: 1000, weightMax: 99, cardsPerPool: 2000 });
const HEADER_RE = /^#\s*(卡池|说明|放回)\s*[：:]\s*(.*)$/;
// 方括号认半角 [ ]、全角 ［ ］ 和 【 】：手机输入法打出来的多半是全角。
const TAG_RE = /^[\[［【]([^\]］】\n]{0,40})[\]］】]\s*/;
const WEIGHT_RE = /\s+[×xX*](\d{1,3})$/;

function unescapeNewlines(text) {
  return String(text).replace(/\\n/g, '\n');
}

function warn(list, line, code, message) {
  list.push({ line, code, message });
}

function cardKey(card) {
  return (card.tag || '') + '\u0000' + card.front;
}

function parseCardLine(raw, lineNo, warnings) {
  let rest = raw;
  let tag = '';
  const tagMatch = rest.match(TAG_RE);
  if (tagMatch) {
    tag = tagMatch[1].trim();
    rest = rest.slice(tagMatch[0].length);
    if (tag.length > LIMITS.tag) {
      warn(warnings, lineNo, 'tag_too_long', '标签超过 ' + LIMITS.tag + ' 个字，已截断');
      tag = tag.slice(0, LIMITS.tag);
    }
  }
  let weight = 1;
  const weightMatch = rest.match(WEIGHT_RE);
  if (weightMatch) {
    const value = Number(weightMatch[1]);
    if (value >= 1 && value <= LIMITS.weightMax) {
      weight = value;
    } else {
      warn(warnings, lineNo, 'weight_out_of_range', '权重只能是 1 到 ' + LIMITS.weightMax + '，这张按 ×1 算');
    }
    rest = rest.slice(0, rest.length - weightMatch[0].length);
  }
  const parts = rest.split('||');
  if (parts.length > 2) warn(warnings, lineNo, 'extra_separator', '一行里有多个 ||，第一个之后的都算反面');
  let front = unescapeNewlines(parts[0].trim());
  let back = parts.length > 1 ? unescapeNewlines(parts.slice(1).join('||').trim()) : '';
  if (!front) {
    warn(warnings, lineNo, 'front_missing', tag ? '只有标签，没有正面文字，跳过' : '没有正面文字，跳过');
    return null;
  }
  if (front.length > LIMITS.front) {
    warn(warnings, lineNo, 'front_too_long', '正面超过 ' + LIMITS.front + ' 字，已截断');
    front = front.slice(0, LIMITS.front);
  }
  if (back.length > LIMITS.back) {
    warn(warnings, lineNo, 'back_too_long', '反面超过 ' + LIMITS.back + ' 字，已截断');
    back = back.slice(0, LIMITS.back);
  }
  return { tag, front, back, weight, line: lineNo };
}

function parseCardText(input) {
  const text = String(input == null ? '' : input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const pools = [];
  const warnings = [];
  let current = null;
  let seen = null;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    const header = line.match(HEADER_RE);
    if (header) {
      const key = header[1];
      const value = header[2].trim();
      if (key === '卡池') {
        if (!value) { warn(warnings, lineNo, 'pool_name_missing', '「# 卡池：」后面没写名字'); current = null; continue; }
        current = { name: value.slice(0, LIMITS.name), description: '', putBack: false, cards: [], line: lineNo };
        seen = new Set();
        pools.push(current);
        if (value.length > LIMITS.name) warn(warnings, lineNo, 'pool_name_too_long', '卡池名超过 ' + LIMITS.name + ' 字，已截断');
      } else if (!current) {
        warn(warnings, lineNo, 'header_before_pool', '「# ' + key + '：」前面还没有「# 卡池：」');
      } else if (key === '说明') {
        current.description = value.slice(0, LIMITS.description);
      } else if (key === '放回') {
        if (value === '是') current.putBack = true;
        else if (value === '否') current.putBack = false;
        else warn(warnings, lineNo, 'put_back_invalid', '放回只能写「是」或「否」，这里按「否」');
      }
      continue;
    }
    if (line.startsWith('#')) {
      warn(warnings, lineNo, 'unknown_header', '不认识的井号行，跳过（卡池头只有 卡池 / 说明 / 放回）');
      continue;
    }
    if (!current) {
      warn(warnings, lineNo, 'card_before_pool', '这张卡前面还没有「# 卡池：」，跳过');
      continue;
    }
    const card = parseCardLine(line, lineNo, warnings);
    if (!card) continue;
    if (current.cards.length >= LIMITS.cardsPerPool) {
      warn(warnings, lineNo, 'pool_full', '一个卡池最多 ' + LIMITS.cardsPerPool + ' 张，后面的跳过');
      continue;
    }
    const key = cardKey(card);
    if (seen.has(key)) {
      card.duplicate = true;
      warn(warnings, lineNo, 'duplicate', '这张和同一卡池里前面的一张重复');
    } else {
      seen.add(key);
    }
    current.cards.push(card);
  }
  for (const pool of pools) {
    if (!pool.cards.length) warn(warnings, pool.line, 'pool_empty', '卡池「' + pool.name + '」里一张卡都没有');
  }
  const cardCount = pools.reduce((sum, pool) => sum + pool.cards.length, 0);
  const duplicateCount = pools.reduce((sum, pool) => sum + pool.cards.filter(card => card.duplicate).length, 0);
  return { pools, warnings, cardCount, duplicateCount };
}

// 导出 / 备份 / 开源都走 JSON：{ format:'draw-cards/1', pools:[{ name, description, putBack, cards:[{ tag, front, back, weight }] }] }
function parseCardJson(input) {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { throw new Error('cards_json_invalid'); }
  }
  if (!value || typeof value !== 'object' || !Array.isArray(value.pools)) throw new Error('cards_json_invalid');
  const lines = [];
  for (const pool of value.pools) {
    if (!pool || typeof pool !== 'object') continue;
    lines.push('# 卡池：' + String(pool.name || '').replace(/\n/g, ' '));
    if (pool.description) lines.push('# 说明：' + String(pool.description).replace(/\n/g, ' '));
    lines.push('# 放回：' + (pool.putBack ? '是' : '否'));
    for (const card of Array.isArray(pool.cards) ? pool.cards : []) {
      if (!card || typeof card !== 'object') continue;
      lines.push(cardToLine(card));
    }
  }
  return parseCardText(lines.join('\n'));
}

function escapeField(text) {
  return String(text || '').replace(/\r?\n/g, '\\n').replace(/\|\|/g, '｜｜');
}

function cardToLine(card) {
  const tag = card.tag ? '[' + String(card.tag).replace(/[\[\]]/g, '') + '] ' : '';
  const back = card.back ? ' || ' + escapeField(card.back) : '';
  const weight = Number(card.weight) > 1 ? ' ×' + Math.min(LIMITS.weightMax, Math.floor(Number(card.weight))) : '';
  return tag + escapeField(card.front) + back + weight;
}

function poolsToText(pools) {
  const out = [];
  for (const pool of pools) {
    out.push('# 卡池：' + pool.name);
    if (pool.description) out.push('# 说明：' + pool.description);
    out.push('# 放回：' + (pool.putBack ? '是' : '否'));
    out.push('');
    for (const card of pool.cards || []) out.push(cardToLine(card));
    out.push('');
  }
  return out.join('\n');
}

function poolsToJson(pools) {
  return {
    format: 'draw-cards/1',
    exportedAt: new Date().toISOString(),
    pools: pools.map(pool => ({
      name: pool.name,
      description: pool.description || '',
      putBack: !!pool.putBack,
      cards: (pool.cards || []).map(card => ({ tag: card.tag || '', front: card.front, back: card.back || '', weight: card.weight || 1 }))
    }))
  };
}

module.exports = Object.freeze({ LIMITS, TAG_RE, parseCardText, parseCardJson, poolsToText, poolsToJson, cardToLine });
