'use strict';

// 并进 TA 收到的那段文字里用的称呼。换成你们自己的：DRAW_CARDS_YOU_NAME / DRAW_CARDS_TA_NAME。
const NAMES = { you: process.env.DRAW_CARDS_YOU_NAME || 'YOU', ta: process.env.DRAW_CARDS_TA_NAME || 'TA' };
// YOU 在聊天里抽的卡：前端只带 drawId 过来，卡面以服务器 draws 里记下的为准，
// 只认 by:'you' 的那几次——前端没法伪造一张卡塞进 YOU 的消息。
// 这里整形成存进 YOU 那条消息的样子，再转成一段给 TA 读的文字（并进 TA 这一轮收到的消息里）。

const MAX_DRAWS = 4;

function str(v, max) { const s = v == null ? '' : String(v).trim(); return s.slice(0, max); }

function shapeDraw(draw) {
  return {
    drawId: str(draw.id, 80),
    poolId: str(draw.poolId, 80),
    poolName: str(draw.poolName, 80),
    skinId: str(draw.skinId, 80),
    by: draw.by === 'ta' ? 'ta' : 'you',
    for: draw.for === 'ta' ? 'ta' : 'you',
    putBack: draw.putBack === true,
    items: (Array.isArray(draw.items) ? draw.items : []).slice(0, 5).map(item => ({
      cardId: str(item.cardId, 80),
      tag: str(item.tag, 20),
      front: str(item.front, 500),
      back: str(item.back, 1000),
      no: Math.max(0, Number(item.no) || 0),
      of: Math.max(0, Number(item.of) || 0)
    })),
    createdAt: str(draw.createdAt, 40)
  };
}

function resolveYouDraws(store, input) {
  if (!store || typeof store.getDraw !== 'function' || !Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const drawId = str(raw && typeof raw === 'object' ? raw.drawId : raw, 80);
    if (!drawId || seen.has(drawId)) continue;
    seen.add(drawId);
    let draw;
    try { draw = store.getDraw(drawId); } catch { continue; }
    if (!draw || draw.by !== 'you' || draw.voidedAt) continue;
    out.push(shapeDraw(draw));
    if (out.length >= MAX_DRAWS) break;
  }
  if (out.length && typeof store.markDrawsSent === 'function') { try { store.markDrawsSent(out.map(item => item.drawId)); } catch { /* 记不上不挡发消息 */ } }
  return out;
}

function describeItem(item) {
  const head = item.of ? '第 ' + item.no + '/' + item.of + ' 张' : '第 ' + item.no + ' 次';
  const tag = item.tag ? '[' + item.tag + '] ' : '';
  const back = item.back ? ' ／ 反面：' + item.back : '';
  return '  ' + head + ' ' + tag + item.front.replace(/\n/g, ' ') + back.replace(/\n/g, ' ');
}

function describeDraws(draws) {
  return (draws || []).map(draw => {
    const who = draw.by === 'ta' ? NAMES.ta : NAMES.you;
    const target = draw.for === draw.by ? '自己' : (draw.for === 'ta' ? NAMES.ta : NAMES.you);
    const pool = draw.poolName ? '（卡池：' + draw.poolName + (draw.putBack ? '，放回' : '') + '）' : '';
    return '[' + who + '给' + target + '抽了 ' + draw.items.length + ' 张卡' + pool + '：\n' + draw.items.map(describeItem).join('\n') + ']';
  }).join('\n');
}

module.exports = { resolveYouDraws, describeDraws, shapeDraw, MAX_DRAWS };
