// 给你抽一张 · 演示页的胶水代码。标了「接线」的地方，就是你们接进自己聊天页时要做的事。
import { apiRequest } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { cardsMarkup, bindCardClicks } from '../cards/card-view.js';
import { DrawPanel, DRAW_BUTTON_SVG } from '../cards/draw-panel.js';
import { mountCards } from '../cards/settings-cards.js';

const $ = sel => document.querySelector(sel);
const messagesNode = $('[data-messages]');
const input = $('[data-input]');
const sendButton = $('[data-send]');

// 接线 1：卡片的点击翻面，全局绑一次
bindCardClicks();

// 接线 2：输入框上的抽卡按钮 + 面板 + 待发区
$('[data-cards-toggle]').innerHTML = DRAW_BUTTON_SVG;
const drawer = new DrawPanel({
  panel: $('[data-cards-panel]'),
  pending: $('[data-pending]'),
  onChange: syncSend
});
$('[data-cards-toggle]').addEventListener('click', () => drawer.toggle());

function syncSend() { sendButton.disabled = !(input.value.trim() || drawer.hasCards()); }
input.addEventListener('input', syncSend);

// 演示页没有真正的聊天后端：抽卡记录从 /cards/draws 里按 drawId 找回来。
// 你们自己的后端应该在收消息时用 server/cards/describe.js 的 resolveYouDraws 换成卡面，存进消息里。
async function lookupDraws(ids) {
  if (!ids.length) return [];
  const { draws } = await apiRequest('/cards/draws?limit=50');
  return ids.map(id => draws.find(draw => draw.id === id)).filter(Boolean)
    .map(draw => ({ drawId: draw.id, poolName: draw.poolName, skinId: draw.skinId, by: draw.by, for: draw.for, note: draw.note || '', items: draw.items, createdAt: draw.createdAt }));
}

function appendMessage(role, text, cards) {
  const node = document.createElement('div');
  node.className = 'demo-msg ' + role;
  // 接线 3：消息里的卡用 cardsMarkup 画出来（YOU 的消息传 'user'，TA 的传 'assistant'）
  node.innerHTML = (text ? '<div class="demo-bubble">' + escapeHtml(text) + '</div>' : '') + cardsMarkup(cards, role === 'you' ? 'user' : 'assistant');
  messagesNode.appendChild(node);
  messagesNode.scrollTop = messagesNode.scrollHeight;
}

sendButton.addEventListener('click', async () => {
  const text = input.value.trim();
  // 接线 4：发消息时把待发的卡（drawId 数组）一起带走
  const ids = drawer.takeCards();
  input.value = '';
  syncSend();
  const cards = await lookupDraws(ids).catch(() => []);
  appendMessage('you', text, cards);
});

// 「让 TA 抽一张」：演示 TA 用 draw_tool 抽卡（example-server 里的 /api/demo/ta-draw 替 TA 调了一次工具）。
// 在你们的宿主里，这一步是 TA 自己决定调用 draw_tool，结果里的 delivery 交给对话去画。
$('[data-ta-draw]').addEventListener('click', async () => {
  try {
    const { delivery } = await apiRequest('/demo/ta-draw', { method: 'POST', body: {} });
    appendMessage('ta', '', [delivery]);
  } catch (error) {
    appendMessage('ta', '没抽出来：' + (error.message || '') + '（先去设置里导入一个卡池）');
  }
});

// 设置页
let settingsMounted = false;
document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
  const name = tab.getAttribute('data-tab');
  document.querySelectorAll('[data-tab]').forEach(other => other.classList.toggle('on', other === tab));
  document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.getAttribute('data-view') !== name; });
  if (name === 'settings' && !settingsMounted) { settingsMounted = true; mountCards({ host: $('[data-settings-host]') }); }
}));
