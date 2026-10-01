// 给你抽一张 · 对话里的卡片：一次抽卡（draw）是一组卡，落进对话时发牌入场。
// 单面卡：背朝上发下来，点一下翻开，再点翻回卡背，可以来回翻。
// 双面卡：默认就是正面朝上，点一下翻到反面，再点翻回正面。正反面用 Ⅰ / Ⅱ 标。
// 翻到哪一面、哪组已经发过牌，都记在内存里，聊天重绘时不丢、不重放。
import { escapeHtml } from '../lib/escape.js';
import { FOR_LABEL } from '../config.js';
import { skinById } from './skins.js';

const turns = new Map();        // drawId:index -> 翻过几次（每次 +180°）
const sparkled = new Set();     // 已经闪过光的卡
const dealtDraws = new Set();   // 已经播过发牌动画的 drawId
const tops = new Map();         // drawId -> 扇形里压在最上面的是第几张
// 一手好几张排成一把扇子：每张绕卡底下方同一个点转一点角度，越往两边越斜。
const FAN_STEP = { 2: 12, 3: 11, 4: 10, 5: 9 };
const DEAL_WINDOW_MS = 3 * 60 * 1000;

function key(drawId, index) { return drawId + ':' + index; }
function forLabel(target) { return target === 'ta' ? FOR_LABEL.ta : FOR_LABEL.you; }

function lengthClass(text) {
  const n = String(text || '').length;
  if (n > 90) return ' kc-text-xs';
  if (n > 50) return ' kc-text-s';
  if (n > 22) return ' kc-text-m';
  return '';
}

function textHtml(text) {
  return escapeHtml(String(text || '')).replace(/\n/g, '<br>');
}

function faceStyle(skin, group) {
  const box = skin.textBox || { x: 14, y: 20, w: 72, h: 60 };
  return '--kc-text:' + group.textColor + ';--kc-tag:' + group.tagColor + ';--kc-tag-bg:' + group.tagBg +
    ';--kc-font:' + skin.font + ';--kc-num-font:' + skin.numberFont +
    ';--kc-box-x:' + box.x + '%;--kc-box-y:' + box.y + '%;--kc-box-w:' + box.w + '%;--kc-box-h:' + box.h + '%';
}

function face(cls, art, tag, text, foot) {
  return '<div class="kc-face ' + cls + '"><img src="' + escapeHtml(art) + '" alt="" draggable="false">' + (tag || '') +
    '<div class="kc-box"><div class="kc-text' + lengthClass(text) + '"' + (/[a-z]/i.test(text) && !/[\u3400-\u9fff]/.test(text) ? ' lang="en"' : '') + '>' + textHtml(text) + '</div></div>' + foot + '</div>';
}

function cardHtml(draw, item, index, total, skin, group, deal) {
  const twoSided = !!(item.back && String(item.back).trim());
  const turn = turns.get(key(draw.drawId, index)) || 0;
  // 单面卡：0° 是卡背、180° 是正面，turn 为偶数时背朝上。
  // 双面卡：一开始就转到 180° 让正面朝上；0° 那面是反面。
  const base = twoSided ? 1 : 0;
  const showing = (base + turn) % 2;          // 1 = 180° 那面朝上
  const rot = total > 1 ? ((index - (total - 1) / 2) * (FAN_STEP[total] || 6)).toFixed(1) : '0';
  const top = total > 1 && (tops.has(draw.drawId) ? tops.get(draw.drawId) : total - 1) === index;
  const tag = item.tag ? '<span class="kc-tag">' + escapeHtml(item.tag) + '</span>' : '';
  const forMark = '<span class="kc-for">' + escapeHtml(forLabel(draw.for)) + '</span>';
  const front = face('kc-front', group.front, tag,
    item.front, '<div class="kc-foot">' + (twoSided ? '<span class="kc-side">Ⅰ</span>' : '') + forMark + '</div>');
  const zero = twoSided
    ? face('kc-zero kc-answer', group.answer, tag, item.back, '<div class="kc-foot"><span class="kc-side">Ⅱ</span>' + forMark + '</div>')
    : '<div class="kc-face kc-zero kc-backside"><img src="' + escapeHtml(group.back) + '" alt="" draggable="false"></div>';
  const hidden = !twoSided && !showing;
  return '<div class="dc-card' + (deal ? ' kc-deal' : '') + (twoSided ? ' kc-two-sided' : '') + (top ? ' kc-top' : '') + '" data-kc-draw="' + escapeHtml(draw.drawId) + '" data-kc-index="' + index + '"' +
    ' style="' + escapeHtml(faceStyle(skin, group) + ';--kc-i:' + index + ';--kc-z:' + (index + 1) + ';--kc-rot:' + rot + 'deg;--kc-turn:' + ((base + turn) * 180) + 'deg') + '"' +
    ' role="button" tabindex="0" aria-label="' + escapeHtml(hidden ? '一张背面朝上的卡，点一下翻开' : (showing ? item.front : item.back)) + '">' +
    '<div class="kc-inner">' + zero.replace('<div class="kc-face kc-zero', '<div' + (showing ? ' aria-hidden="true"' : '') + ' class="kc-face kc-zero') +
    front.replace('<div class="kc-face kc-front', '<div' + (showing ? '' : ' aria-hidden="true"') + ' class="kc-face kc-front') +
    '</div><div class="kc-shine" aria-hidden="true"></div></div>';
}

export function cardsMarkup(draws, role) {
  if (!Array.isArray(draws) || !draws.length) return '';
  return draws.slice(0, 4).map(draw => {
    if (!draw || !draw.drawId || !Array.isArray(draw.items) || !draw.items.length) return '';
    const skin = skinById(draw.skinId);
    const group = skin.groups[draw.for === 'ta' ? 'ta' : 'you'];
    const created = Date.parse(draw.createdAt || '') || 0;
    const deal = !dealtDraws.has(draw.drawId) && created && Date.now() - created < DEAL_WINDOW_MS;
    dealtDraws.add(draw.drawId);
    const items = draw.items.slice(0, 5);
    const cards = items.map((item, index) => cardHtml(draw, item, index, items.length, skin, group, deal)).join('');
    const note = draw.note ? '<div class="dc-draw-note">' + textHtml(draw.note) + '</div>' : '';
    const pool = draw.poolName ? '<span class="dc-draw-pool">' + escapeHtml(draw.poolName) + '</span>' : '';
    return '<div class="dc-draw dc-draw-' + (role === 'user' ? 'user' : 'assistant') + (items.length > 1 ? ' dc-draw-hand dc-draw-hand-' + items.length : '') + '" data-kc-for="' + (draw.for === 'ta' ? 'ta' : 'you') + '">' +
      note + '<div class="dc-draw-cards">' + cards + '</div>' + pool + '</div>';
  }).join('');
}

function sparkle(card) {
  const layer = document.createElement('div');
  layer.className = 'kc-stars';
  for (let i = 0; i < 7; i++) {
    const star = document.createElement('span');
    star.style.setProperty('--sx', (Math.random() * 100).toFixed(0) + '%');
    star.style.setProperty('--sy', (Math.random() * 100).toFixed(0) + '%');
    star.style.setProperty('--sd', (Math.random() * 260).toFixed(0) + 'ms');
    layer.appendChild(star);
  }
  card.appendChild(layer);
  card.classList.add('kc-shining');
  setTimeout(() => { layer.remove(); card.classList.remove('kc-shining'); }, 1300);
}

function flip(card) {
  const drawId = card.getAttribute('data-kc-draw');
  const index = Number(card.getAttribute('data-kc-index')) || 0;
  const k = key(drawId, index);
  const twoSided = card.classList.contains('kc-two-sided');
  const turn = (turns.get(k) || 0) + 1;
  turns.set(k, turn);
  card.classList.remove('kc-deal');
  const base = twoSided ? 1 : 0;
  card.style.setProperty('--kc-turn', ((base + turn) * 180) + 'deg');
  const showing = (base + turn) % 2;
  const frontFace = card.querySelector('.kc-front');
  const zeroFace = card.querySelector('.kc-zero');
  if (frontFace) { if (showing) frontFace.removeAttribute('aria-hidden'); else frontFace.setAttribute('aria-hidden', 'true'); }
  if (zeroFace) { if (showing) zeroFace.setAttribute('aria-hidden', 'true'); else zeroFace.removeAttribute('aria-hidden'); }
  const visible = showing ? frontFace : zeroFace;
  const text = visible && visible.querySelector('.kc-text') ? visible.querySelector('.kc-text').textContent : '';
  card.setAttribute('aria-label', text || '一张背面朝上的卡，点一下翻开');
  // 第一次把题翻出来那一下闪光；之后来回翻就安安静静地翻。
  if (!twoSided && showing && !sparkled.has(k)) { sparkled.add(k); sparkle(card); }
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
}

// 扇子里点一张没在最上面的：先把它抽到最上面（微微提起来），再点才翻面。
function raise(card) {
  const hand = card.closest('.dc-draw-cards');
  if (hand) hand.querySelectorAll('.dc-card.kc-top').forEach(other => other.classList.remove('kc-top'));
  card.classList.remove('kc-deal');
  card.classList.add('kc-top');
  tops.set(card.getAttribute('data-kc-draw'), Number(card.getAttribute('data-kc-index')) || 0);
  if (navigator.vibrate) { try { navigator.vibrate(6); } catch {} }
}

let bound = false;
export function bindCardClicks() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  const handler = event => {
    const card = event.target && event.target.closest ? event.target.closest('.dc-card') : null;
    if (!card) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (card.closest('.dc-draw-hand') && !card.classList.contains('kc-top')) { raise(card); return; }
    flip(card);
  };
  document.addEventListener('click', handler);
  document.addEventListener('keydown', handler);
}
