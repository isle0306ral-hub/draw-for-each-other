// 给你抽一张 · 聊天输入框上的抽卡入口：按钮 → 抽卡面板 → 抽中的卡先挂在输入框上（待发区），跟着下一条消息一起发。
//
// 接法（详见 docs/INTEGRATION.md「聊天页入口」）：
//   1) 在输入框的按钮行里放一个按钮，图标用 DRAW_BUTTON_SVG
//   2) 在输入框上方放两个空容器：一个装抽卡面板，一个装待发区
//   3) const drawer = new DrawPanel({ panel, pending, onChange, isBusy })；按钮点击 → drawer.toggle()
//   4) 发消息时：const cards = drawer.takeCards() → 把 cards（drawId 数组）放进消息体发给后端；
//      后端用 server/cards/describe.js 的 resolveYouDraws(store, cards) 换成卡面，存进这条消息，并告诉 TA
//   5) 渲染消息时：cardsMarkup(message.cards, 'user' | 'assistant')，全局调一次 bindCardClicks()
//
// 抽卡本身在服务器上做（权重、不放回都在那边），前端只负责选卡池、给谁、几张，以及动画。
import { apiRequest } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { TA_NAME } from '../config.js';
import { skinById, iconUrl } from './skins.js';

export const DRAW_BUTTON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5.5 6.5h8a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5Z M8.5 3.5h9A1.5 1.5 0 0 1 19 5v11"/><path fill="currentColor" d="M9.5 10.4l.8 1.62 1.8.26-1.3 1.27.3 1.8-1.6-.85-1.6.85.3-1.8-1.3-1.27 1.8-.26z"/></svg>';

function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export class DrawPanel {
  // panel：装抽卡面板的空容器；pending：装待发区的空容器
  // onChange()：待发区变了（抽中 / 放回 / 发出去），宿主据此刷新发送按钮能不能点
  // isBusy()：可选，返回 true 时不让抽（比如 TA 正在回上一条）
  constructor({ panel, pending, onChange, isBusy } = {}) {
    this.panel = panel;
    this.pendingNode = pending;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    this.isBusy = typeof isBusy === 'function' ? isBusy : () => false;
    this.pools = null;
    this.prefs = null;
    this.settingsOpen = false;
    this.drawing = false;
    this.pendingCards = [];
    if (this.panel) this.panel.hidden = true;
    this.renderPending();
  }

  hasCards() { return this.pendingCards.length > 0; }

  // 发消息时调用：拿走待发的这一手（drawId 数组），待发区清空。发出去以后就不能放回了。
  takeCards() {
    const ids = this.pendingCards.map(item => item.drawId);
    this.pendingCards = [];
    this.renderPending();
    this.onChange();
    return ids;
  }

  close() { if (this.panel) this.panel.hidden = true; }

  async toggle() {
    if (!this.panel) return;
    const willOpen = this.panel.hidden === true;
    this.panel.hidden = !willOpen;
    if (willOpen) await this.loadPools();
  }

  async loadPools() {
    if (!Array.isArray(this.pools)) this.panel.innerHTML = '<div class="cards-panel-empty">Loading…</div>';
    try {
      const result = await apiRequest('/cards/pools');
      this.pools = Array.isArray(result && result.pools) ? result.pools : [];
      this.prefs = result && result.prefs ? result.prefs : { poolId: '', tag: '', for: 'ta', count: 1 };
    } catch {
      this.pools = Array.isArray(this.pools) ? this.pools : [];
      this.prefs = this.prefs || { poolId: '', tag: '', for: 'ta', count: 1 };
    }
    if (this.pools.length && !this.pools.some(pool => pool.id === this.prefs.poolId)) {
      this.prefs = { ...this.prefs, poolId: this.pools[0].id };
      this.settingsOpen = true;
    }
    this.render();
  }

  currentPool() {
    const pools = this.pools || [];
    return pools.find(item => item.id === (this.prefs && this.prefs.poolId)) || pools[0] || null;
  }

  // 这次最多能抽几张：不放回的卡池按这一轮剩下的算（剩 0 说明下一抽会洗牌，按整池算），放回的按整池算。
  room(pool) {
    if (!pool) return 0;
    const total = Math.max(0, Number(pool.count) || 0);
    if (pool.putBack) return Math.min(5, total);
    const left = Math.max(0, Number(pool.remaining) || 0);
    return Math.min(5, left > 0 ? left : total);
  }

  render() {
    const panel = this.panel;
    if (!panel) return;
    const pools = this.pools || [];
    if (!pools.length) { panel.innerHTML = '<div class="cards-panel-empty">还没有卡池——先去设置页导入第一批</div>'; return; }
    const prefs = this.prefs || { poolId: '', tag: '', for: 'ta', count: 1 };
    const pool = this.currentPool();
    const tags = Object.keys(pool.tags || {}).filter(Boolean);
    const tag = tags.includes(prefs.tag) ? prefs.tag : '';
    const back = skinById(pool.skinId).groups[prefs.for === 'you' ? 'you' : 'ta'].back;
    const want = Number(prefs.count) || 1;
    const room = this.room(pool);
    const take = Math.min(want, room);
    const chip = (attr, value, label, on, extra) => '<button type="button" class="cp-chip' + (on ? ' on' : '') + '" ' + attr + '="' + escapeHtml(value) + '">' + escapeHtml(label) + (extra ? '<small>' + escapeHtml(extra) + '</small>' : '') + '</button>';
    const remain = pool.putBack ? '放回 · ' + pool.count + ' 张' : '剩 ' + pool.remaining + ' / ' + pool.count;
    const hint = want > room
      ? (pool.putBack || pool.remaining === 0
        ? '这个卡池一共只有 ' + pool.count + ' 张，这次最多抽 ' + room + ' 张'
        : '这一轮只剩 ' + pool.remaining + ' 张了，这次最多抽 ' + room + ' 张；抽完会重新洗牌')
      : (!pool.putBack && pool.remaining === 0 ? '这一轮抽完了，再抽会重新洗牌' : '');
    const settings = this.settingsOpen
      ? '<div class="cp-settings">' +
        '<div class="cp-label">卡池</div><div class="cp-chips">' + pools.map(item => chip('data-cp-pool', item.id, item.name, item.id === pool.id, item.putBack ? '放回' : '剩 ' + item.remaining)).join('') + '</div>' +
        (tags.length ? '<div class="cp-label">只抽</div><div class="cp-chips">' + chip('data-cp-tag', '', '不限', !tag) + tags.map(name => chip('data-cp-tag', name, name, name === tag, String(pool.tags[name]))).join('') + '</div>' : '') +
        '<div class="cp-label">给谁抽</div><div class="cp-chips">' + chip('data-cp-for', 'ta', '给 ' + TA_NAME, prefs.for !== 'you') + chip('data-cp-for', 'you', '给我自己', prefs.for === 'you') + '</div>' +
        '<div class="cp-label">一次抽几张</div><div class="cp-chips">' + [1, 2, 3, 4, 5].map(n => chip('data-cp-count', String(n), String(n), want === n).replace('class="cp-chip', 'class="cp-chip' + (n > room ? ' over' : ''))).join('') + '</div></div>'
      : '';
    const meta = (prefs.for === 'you' ? '给我自己' : '给 ' + TA_NAME) + ' · ' + take + ' 张' + (tag ? ' · 只抽' + tag : '') + ' · ' + remain;
    panel.innerHTML =
      '<button type="button" class="cp-head" data-cp-toggle-settings><img class="cp-icon" src="' + escapeHtml(iconUrl(pool.icon)) + '" alt=""><span class="cp-name">' + escapeHtml(pool.name) + '</span><span class="cp-meta">' + escapeHtml(meta) + '</span><span class="cp-change">' + (this.settingsOpen ? '收起' : '换') + '</span></button>' +
      settings +
      '<div class="cp-stage"><div class="kc-shuffle" data-cp-deck><img src="' + escapeHtml(back) + '" alt=""><img src="' + escapeHtml(back) + '" alt=""><img src="' + escapeHtml(back) + '" alt=""></div>' +
      '<button type="button" class="cp-draw" data-cp-draw' + (this.drawing ? ' disabled' : '') + '>' + (this.drawing ? '洗牌中…' : '抽 ' + take + ' 张') + '</button></div>' +
      (hint ? '<div class="cp-hint">' + escapeHtml(hint) + '</div>' : '') +
      '<div class="cp-error" data-cp-error hidden></div>';
    panel.querySelector('[data-cp-toggle-settings]')?.addEventListener('click', () => { this.settingsOpen = !this.settingsOpen; this.render(); });
    panel.querySelectorAll('[data-cp-pool]').forEach(btn => btn.addEventListener('click', () => this.updatePrefs({ poolId: btn.getAttribute('data-cp-pool'), tag: '' })));
    panel.querySelectorAll('[data-cp-tag]').forEach(btn => btn.addEventListener('click', () => this.updatePrefs({ tag: btn.getAttribute('data-cp-tag') })));
    panel.querySelectorAll('[data-cp-for]').forEach(btn => btn.addEventListener('click', () => this.updatePrefs({ for: btn.getAttribute('data-cp-for') })));
    panel.querySelectorAll('[data-cp-count]').forEach(btn => btn.addEventListener('click', () => this.updatePrefs({ count: Number(btn.getAttribute('data-cp-count')) })));
    panel.querySelector('[data-cp-draw]')?.addEventListener('click', () => this.draw());
  }

  async updatePrefs(patch) {
    // 卡池一直跟着一起记：只记改的那一项的话，服务器回来的偏好里没有卡池，点「抽」就什么都不做（踩过）
    const pool = this.currentPool();
    if (!patch.poolId && pool) patch = { ...patch, poolId: pool.id };
    this.prefs = { ...this.prefs, ...patch };
    this.render();
    try {
      const result = await apiRequest('/cards/prefs', { method: 'PUT', body: patch });
      if (result && result.prefs) this.prefs = result.prefs;
    } catch {}
  }

  showError(text) {
    const node = this.panel && this.panel.querySelector('[data-cp-error]');
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
  }

  async draw() {
    if (this.drawing) return;
    const pool = this.currentPool();
    if (!pool) { this.showError('还没有卡池'); return; }
    if (!pool.count) { this.showError('这个卡池还是空的'); return; }
    if (this.isBusy()) { this.showError('等 ' + TA_NAME + ' 回完这一条再抽'); return; }
    const take = Math.max(1, Math.min(Number(this.prefs && this.prefs.count) || 1, this.room(pool)));
    const request = { poolId: pool.id, for: this.prefs.for === 'you' ? 'you' : 'ta', count: take, tag: this.prefs.tag || '' };
    this.drawing = true;
    this.settingsOpen = false;
    this.render();
    this.panel.querySelector('[data-cp-deck]')?.classList.add('is-shuffling');
    const started = Date.now();
    let draw = null;
    let error = '';
    try {
      const result = await apiRequest('/cards/draw', { method: 'POST', body: { ...request, clientDrawId: newId('draw') } });
      draw = result && result.draw;
    } catch (failure) { error = String(failure && failure.message || ''); }
    // 洗牌至少切满一秒再出牌，不然动画还没看清就没了
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - started))));
    this.drawing = false;
    if (!draw) {
      this.render();
      this.showError(error.includes('no_cards_with_tag') ? '这个标签下没有卡了' : error.includes('pool_empty') ? '这个卡池还是空的' : '没抽出来，再试一次');
      return;
    }
    this.pools = null;
    this.close();
    // 抽出来先挂在输入框上，不直接发：YOU 还要配一句话、一张表情包或者一条语音；不满意可以重抽
    this.pendingCards = [{ drawId: draw.id, poolName: draw.poolName, poolIcon: pool.icon || '', for: draw.for, items: draw.items, request }];
    this.renderPending();
    this.onChange();
  }

  // 放回：这一手作废，卡回到这一轮里，下次还可能抽到
  async voidPending() {
    const pc = this.pendingCards[0];
    if (!pc) return;
    try { await apiRequest('/cards/draws/' + encodeURIComponent(pc.drawId) + '/void', { method: 'POST', body: {} }); } catch {}
  }

  async putBack() {
    if (this.drawing) return;
    await this.voidPending();
    this.pendingCards = [];
    this.pools = null;
    this.renderPending();
    this.onChange();
  }

  async redraw() {
    const pc = this.pendingCards[0];
    if (!pc || this.drawing) return;
    this.drawing = true;
    this.renderPending();
    await this.voidPending();
    let draw = null;
    try {
      const result = await apiRequest('/cards/draw', { method: 'POST', body: { ...pc.request, clientDrawId: newId('draw') } });
      draw = result && result.draw;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 450));
    this.drawing = false;
    this.pools = null;
    this.pendingCards = draw ? [{ ...pc, drawId: draw.id, poolName: draw.poolName, for: draw.for, items: draw.items }] : [];
    this.renderPending();
    this.onChange();
  }

  renderPending() {
    const node = this.pendingNode;
    if (!node) return;
    const pc = this.pendingCards[0];
    node.hidden = !pc;
    if (!pc) { node.innerHTML = ''; return; }
    node.innerHTML = '<div class="pending-cards"><img class="pc-icon" src="' + escapeHtml(iconUrl(pc.poolIcon || '')) + '" alt="">' +
      '<div class="pc-body"><div class="pc-title">' + (pc.for === 'you' ? '给自己' : '给 ' + escapeHtml(TA_NAME) + ' ') + '抽了 ' + pc.items.length + ' 张 · ' + escapeHtml(pc.poolName || '') + '</div>' +
      pc.items.map(item => '<div class="pc-line">' + (item.tag ? '<b>' + escapeHtml(item.tag) + '</b>' : '') + escapeHtml(item.front || '') + '</div>').join('') + '</div>' +
      '<div class="pc-acts"><button type="button" data-redraw-cards' + (this.drawing ? ' disabled' : '') + '>' + (this.drawing ? '洗牌…' : '重抽') + '</button><button type="button" data-remove-cards aria-label="放回去">放回</button></div></div>';
    node.querySelector('[data-remove-cards]')?.addEventListener('click', () => this.putBack());
    node.querySelector('[data-redraw-cards]')?.addEventListener('click', () => this.redraw());
  }
}
