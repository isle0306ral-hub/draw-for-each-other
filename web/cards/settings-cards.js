// 给你抽一张 · 设置页「卡池」：卡池列表、导入（先预览再导）、导出、点进去改卡池和卡。
// 这一页是维护用的，能看到卡池里有什么；抽卡在聊天里抽，抽之前看不到。
// 用法：mountCards({ host })，host 是你设置页里一块空的容器。
import { apiRequest } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { POOL_ICONS, iconUrl } from './skins.js';

const TEMPLATE_URL = new URL('./cards-template.txt', import.meta.url).href;

function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toast(text) {
  let node = document.querySelector('.ck-toast');
  if (!node) { node = document.createElement('div'); node.className = 'ck-toast'; document.body.appendChild(node); }
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(node._t);
  node._t = setTimeout(() => node.classList.remove('show'), 2200);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

async function exportPools(poolId, format, name) {
  const query = '?format=' + format + (poolId ? '&poolId=' + encodeURIComponent(poolId) : '');
  const result = await apiRequest('/cards/export' + query);
  const text = format === 'text' ? String(result.content || '') : JSON.stringify(result.content, null, 2);
  download((name || 'draw-cards') + '-' + stamp() + (format === 'text' ? '.txt' : '.json'), text, format === 'text' ? 'text/plain;charset=utf-8' : 'application/json');
}

function poolMeta(pool) {
  const tags = Object.keys(pool.tags || {}).filter(Boolean).map(tag => tag + ' ' + pool.tags[tag]).join(' · ');
  return pool.count + ' 张' + (pool.putBack ? ' · 放回' : ' · 剩 ' + pool.remaining) + (tags ? ' · ' + tags : '');
}

export async function mountCards({ host }) {
  host.classList.add('dc-settings');
  host.innerHTML = '<div class="page-title">Cards</div><div class="page-sub">draw for each other</div><div class="settings-stack" data-cards-root></div>';
  await renderList(host);
}

async function renderList(host) {
  const root = host.querySelector('[data-cards-root]');
  if (!root) return;
  root.innerHTML =
    '<section class="settings-card ck-card">' +
      '<div class="ck-head"><span class="ck-title">我们的卡池</span></div>' +
      '<div class="ck-sub">抽的时候看不见，只有在这里看得见。</div>' +
      '<div class="cards-pool-list" data-pool-list>正在读取…</div>' +
      '<button class="ck-row ck-add" type="button" data-pool-new><span class="ck-plus">+</span><span>新建一个空卡池</span></button>' +
    '</section>' +
    '<section class="settings-card ck-card">' +
      '<div class="ck-head"><span class="ck-title">导入</span><a class="ck-link" href="' + TEMPLATE_URL + '" download="卡池导入模板.txt">下载模板</a></div>' +
      '<div class="ck-sub">把题目粘贴进来，或者选一个 .txt / .json 文件。按模板规则一行一行认，不经过模型。</div>' +
      '<textarea class="input-like cards-import-text" data-import-text rows="7" placeholder="# 卡池：真心话大冒险·第二批&#10;# 放回：否&#10;[真心话] 你手机里最不敢给我看的是什么？&#10;[大冒险] 用气声说一句我爱你"></textarea>' +
      '<div class="ck-under"><button class="ck-link" type="button" data-import-file>从文件选…</button></div>' +
      '<div class="cards-import-check" data-import-check hidden></div>' +
      '<div class="ck-step" data-import-step hidden><div class="ck-label">导入到</div>' +
        '<div class="cards-seg" data-import-mode><button type="button" class="on" data-mode="new">新建卡池</button><button type="button" data-mode="merge">并进同名卡池</button></div></div>' +
      '<button class="ck-primary" type="button" data-import-go disabled>导入</button>' +
      '<input type="file" data-import-input accept=".txt,.json,text/plain,application/json" hidden>' +
    '</section>' +
    '<div class="ck-foot">导出全部卡池：<button class="ck-link" type="button" data-export-all="json">JSON</button><span>·</span><button class="ck-link" type="button" data-export-all="text">TXT</button></div>';

  const list = root.querySelector('[data-pool-list]');
  let pools = [];
  try {
    const result = await apiRequest('/cards/pools');
    pools = Array.isArray(result && result.pools) ? result.pools : [];
  } catch { list.innerHTML = '<div class="ck-sub">读不到卡池，稍后再试。</div>'; }
  if (list && !pools.length && list.textContent === '正在读取…') list.innerHTML = '<div class="ck-sub">还没有卡池。下面导入第一批吧。</div>';
  if (pools.length) {
    list.innerHTML = pools.map(pool =>
      '<button type="button" class="cards-pool-row" data-pool-open="' + escapeHtml(pool.id) + '"><img src="' + escapeHtml(iconUrl(pool.icon)) + '" alt=""><span class="cards-pool-text"><span class="cards-pool-name">' + escapeHtml(pool.name) + '</span><span class="cards-pool-meta">' + escapeHtml(poolMeta(pool)) + '</span></span><span class="cards-pool-go">›</span></button>'
    ).join('');
  }
  list.querySelectorAll('[data-pool-open]').forEach(button => button.addEventListener('click', () => renderPool(host, button.getAttribute('data-pool-open'))));
  root.querySelector('[data-pool-new]').addEventListener('click', async () => {
    const name = prompt('新卡池叫什么？');
    if (!name || !name.trim()) return;
    try {
      const result = await apiRequest('/cards/pools', { method: 'POST', body: { name: name.trim(), icon: 'card' } });
      if (result && result.pool) renderPool(host, result.pool.id);
    } catch { toast('没建成，再试一次'); }
  });
  root.querySelectorAll('[data-export-all]').forEach(button => button.addEventListener('click', () => exportPools('', button.getAttribute('data-export-all'), 'draw-cards').catch(() => toast('导出失败'))));

  const text = root.querySelector('[data-import-text]');
  const check = root.querySelector('[data-import-check]');
  const go = root.querySelector('[data-import-go]');
  const fileInput = root.querySelector('[data-import-input]');
  let mode = 'new';
  let jsonPayload = null;
  let timer = 0;
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.getAttribute('data-mode');
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b === button));
  }));
  async function preview() {
    const value = text.value;
    const step = root.querySelector('[data-import-step]');
    const setGo = (n, ok) => { go.disabled = !ok; go.textContent = ok && n ? '导入 ' + n + ' 张卡' : '导入'; step.hidden = !ok; check.hidden = !value.trim(); };
    if (!value.trim()) { check.innerHTML = ''; setGo(0, false); return; }
    if (jsonPayload) { check.innerHTML = '<div class="cards-ok">已选 JSON 文件，导入时按 JSON 认。</div>'; setGo(0, true); return; }
    try {
      const result = await apiRequest('/cards/preview', { method: 'POST', body: { text: value } });
      const p = result.preview;
      const lines = p.pools.map(pool => '<div class="cards-ok">「' + escapeHtml(pool.name) + '」' + pool.count + ' 张' + (pool.putBack ? ' · 放回' : '') + '</div>').join('');
      const warns = p.warnings.slice(0, 30).map(w => '<div class="cards-warn">第 ' + w.line + ' 行：' + escapeHtml(w.message) + '</div>').join('') + (p.warnings.length > 30 ? '<div class="cards-warn">还有 ' + (p.warnings.length - 30) + ' 条……</div>' : '');
      check.innerHTML = '<div class="cards-ok"><b>认出 ' + p.pools.length + ' 个卡池，共 ' + p.cardCount + ' 张卡</b>' + (p.duplicateCount ? '，其中 ' + p.duplicateCount + ' 张重复（导入时跳过）' : '') + '</div>' + lines + warns;
      setGo(p.cardCount, p.cardCount > 0);
    } catch { check.innerHTML = '<div class="cards-warn">预览失败，等一下再试</div>'; setGo(0, false); }
  }
  text.addEventListener('input', () => { jsonPayload = null; clearTimeout(timer); timer = setTimeout(preview, 350); });
  root.querySelector('[data-import-file]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const content = await file.text();
    jsonPayload = /\.json$/i.test(file.name) ? content : null;
    text.value = jsonPayload ? content.slice(0, 4000) + (content.length > 4000 ? '\n……' : '') : content;
    fileInput.value = '';
    preview();
  });
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      const body = jsonPayload ? { json: jsonPayload, mode } : { text: text.value, mode };
      const result = await apiRequest('/cards/import', { method: 'POST', body });
      const r = result.result;
      await renderList(host);
      toast('导入好了：' + (r.created.length ? '新建 ' + r.created.length + ' 个卡池，' : '') + (r.merged.length ? '并进 ' + r.merged.length + ' 个卡池，' : '') + '加了 ' + r.added + ' 张' + (r.skipped ? '，跳过 ' + r.skipped + ' 张重复' : ''));
    } catch { toast('没导进去，检查一下格式'); go.disabled = false; }
  });
}

async function renderPool(host, poolId) {
  const root = host.querySelector('[data-cards-root]');
  if (!root) return;
  root.innerHTML = '<div class="ck-sub">正在打开…</div>';
  let pool;
  try { pool = (await apiRequest('/cards/pools/' + encodeURIComponent(poolId))).pool; }
  catch { root.innerHTML = '<div class="ck-sub">打不开这个卡池。</div><button class="ck-back" type="button" data-back>‹ 所有卡池</button>'; root.querySelector('[data-back]').addEventListener('click', () => renderList(host)); return; }
  let search = '';
  let tagFilter = '';
  let editing = '';
  const icons = POOL_ICONS.map(icon => '<button type="button" class="cards-icon-pick' + ((pool.icon || 'card') === icon.id ? ' on' : '') + '" data-icon="' + icon.id + '"><img src="' + icon.url + '" alt="' + icon.id + '"></button>').join('');
  root.innerHTML =
    '<button class="ck-back" type="button" data-back>‹ 所有卡池</button>' +
    '<section class="settings-card ck-card">' +
      '<div class="ck-hero"><img data-hero-icon src="' + escapeHtml(iconUrl(pool.icon)) + '" alt=""><div class="ck-hero-text">' +
        '<input class="ck-name" data-f-name maxlength="60" value="' + escapeHtml(pool.name) + '" placeholder="卡池名字">' +
        '<div class="ck-sub" data-pool-stat></div></div></div>' +
      '<input class="input-like ck-input" data-f-desc maxlength="200" value="' + escapeHtml(pool.description || '') + '" placeholder="一句话说明（可选）">' +
      '<div class="ck-label">图标</div><div class="cards-icon-grid" data-icons>' + icons + '</div>' +
      '<div class="ck-label">抽法</div>' +
      '<div class="cards-seg" data-putback><button type="button" data-pb="0" class="' + (pool.putBack ? '' : 'on') + '">不放回 · 一轮不重复</button><button type="button" data-pb="1" class="' + (pool.putBack ? 'on' : '') + '">放回 · 每次从全部抽</button></div>' +
      '<button class="ck-primary" type="button" data-save>保存</button>' +
    '</section>' +
    '<section class="settings-card ck-card">' +
      '<div class="ck-head"><span class="ck-title">卡</span><button class="ck-link" type="button" data-add-toggle>+ 加一张</button></div>' +
      '<div class="ck-addbox" data-addbox hidden>' +
        '<div class="cards-add-row"><input class="input-like ck-input" data-a-tag maxlength="20" placeholder="标签（可选），比如 真心话"><label class="ck-weight"><span>×</span><input class="input-like ck-input" data-a-weight type="number" min="1" max="99" value="1" title="权重"></label></div>' +
        '<textarea class="input-like ck-input" data-a-front rows="2" maxlength="500" placeholder="正面：题目"></textarea>' +
        '<textarea class="input-like ck-input" data-a-back rows="2" maxlength="1000" placeholder="反面（可选）：写了就是双面卡"></textarea>' +
        '<div class="ck-btnrow"><button class="ck-primary" type="button" data-add>加进去</button><button class="ck-ghost" type="button" data-add-cancel>收起</button></div>' +
      '</div>' +
      '<input class="input-like ck-input" data-search placeholder="搜题目">' +
      '<div class="cards-tag-filter" data-tags></div><div class="cards-card-list" data-cards></div>' +
    '</section>' +
    '<section class="settings-card ck-card ck-menu">' +
      '<button class="ck-row" type="button" data-reset><span>重新洗牌</span><small>这一轮抽过的全部放回</small></button>' +
      '<button class="ck-row" type="button" data-exp="json"><span>导出 JSON</span></button>' +
      '<button class="ck-row" type="button" data-exp="text"><span>导出 TXT</span></button>' +
      '<button class="ck-row ck-danger" type="button" data-del><span>删除这个卡池</span></button>' +
    '</section>';

  const stat = root.querySelector('[data-pool-stat]');
  let icon = pool.icon || 'card';
  let putBack = !!pool.putBack;
  function updateStat() { stat.textContent = poolMeta(pool) + (pool.putBack ? '' : ' · 第 ' + pool.round + ' 轮'); }
  updateStat();
  root.querySelector('[data-back]').addEventListener('click', () => renderList(host));
  root.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => { icon = b.getAttribute('data-icon'); root.querySelectorAll('[data-icon]').forEach(x => x.classList.toggle('on', x === b)); root.querySelector('[data-hero-icon]').src = iconUrl(icon); }));
  const addbox = root.querySelector('[data-addbox]');
  root.querySelector('[data-add-toggle]').addEventListener('click', () => { addbox.hidden = !addbox.hidden; if (!addbox.hidden) root.querySelector('[data-a-front]').focus(); });
  root.querySelector('[data-add-cancel]').addEventListener('click', () => { addbox.hidden = true; });
  root.querySelectorAll('[data-pb]').forEach(b => b.addEventListener('click', () => { putBack = b.getAttribute('data-pb') === '1'; root.querySelectorAll('[data-pb]').forEach(x => x.classList.toggle('on', x === b)); }));
  root.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      const result = await apiRequest('/cards/pools/' + encodeURIComponent(pool.id), { method: 'PATCH', body: { name: root.querySelector('[data-f-name]').value, description: root.querySelector('[data-f-desc]').value, icon, putBack } });
      Object.assign(pool, result.pool); updateStat(); toast('保存好了');
    } catch { toast('没保存上：名字不能空'); }
  });
  root.querySelector('[data-reset]').addEventListener('click', async () => {
    if (!confirm('重新洗牌？这一轮抽过的都会放回去。')) return;
    try { Object.assign(pool, (await apiRequest('/cards/pools/' + encodeURIComponent(pool.id) + '/reset', { method: 'POST', body: {} })).pool); updateStat(); toast('洗好了，从头开始'); } catch { toast('没洗成'); }
  });
  root.querySelectorAll('[data-exp]').forEach(b => b.addEventListener('click', () => exportPools(pool.id, b.getAttribute('data-exp'), pool.name).catch(() => toast('导出失败'))));
  root.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm('删除卡池「' + pool.name + '」？里面 ' + pool.count + ' 张卡都会删掉。聊天里已经抽出来的卡不受影响。')) return;
    if (!confirm('真的删？删了就找不回来了。')) return;
    try { await apiRequest('/cards/pools/' + encodeURIComponent(pool.id), { method: 'DELETE' }); renderList(host); } catch { toast('没删掉'); }
  });
  root.querySelector('[data-add]').addEventListener('click', async () => {
    const front = root.querySelector('[data-a-front]').value.trim();
    if (!front) { toast('正面要写点什么'); return; }
    try {
      const card = (await apiRequest('/cards/pools/' + encodeURIComponent(pool.id) + '/cards', { method: 'POST', body: { tag: root.querySelector('[data-a-tag]').value, front, back: root.querySelector('[data-a-back]').value, weight: Number(root.querySelector('[data-a-weight]').value) || 1 } })).card;
      pool.cards.push(card); pool.count++; pool.remaining++;
      root.querySelector('[data-a-front]').value = ''; root.querySelector('[data-a-back]').value = '';
      refreshTags(); drawCards(); updateStat(); toast('加进去了');
    } catch { toast('没加上'); }
  });
  root.querySelector('[data-search]').addEventListener('input', e => { search = e.target.value.trim(); drawCards(); });

  function refreshTags() {
    const counts = {};
    pool.cards.forEach(card => { if (card.tag) counts[card.tag] = (counts[card.tag] || 0) + 1; });
    pool.tags = counts;
    const box = root.querySelector('[data-tags]');
    const names = Object.keys(counts);
    box.innerHTML = names.length ? ['<button type="button" class="cp-chip' + (!tagFilter ? ' on' : '') + '" data-t="">全部 ' + pool.cards.length + '</button>'].concat(names.map(n => '<button type="button" class="cp-chip' + (tagFilter === n ? ' on' : '') + '" data-t="' + escapeHtml(n) + '">' + escapeHtml(n) + ' ' + counts[n] + '</button>')).join('') : '';
    box.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { tagFilter = b.getAttribute('data-t'); refreshTags(); drawCards(); }));
  }

  function drawCards() {
    const box = root.querySelector('[data-cards]');
    const drawn = new Set(pool.drawnIds || []);
    const shown = pool.cards.filter(card => (!tagFilter || card.tag === tagFilter) && (!search || (card.front + ' ' + (card.back || '') + ' ' + (card.tag || '')).includes(search)));
    if (!shown.length) { box.innerHTML = '<div class="ck-sub">' + (pool.cards.length ? '没有对得上的卡' : '还没有卡') + '</div>'; return; }
    box.innerHTML = shown.slice(0, 400).map(card => {
      if (editing === card.id) {
        return '<div class="cards-card-row editing" data-card="' + escapeHtml(card.id) + '"><div class="cards-add-row"><input class="input-like ck-input" data-e-tag maxlength="20" value="' + escapeHtml(card.tag || '') + '" placeholder="标签"><input class="input-like ck-input" data-e-weight type="number" min="1" max="99" value="' + (card.weight || 1) + '"></div>' +
          '<textarea class="input-like ck-input" data-e-front rows="2">' + escapeHtml(card.front) + '</textarea><textarea class="input-like ck-input" data-e-back rows="2" placeholder="反面（可选）">' + escapeHtml(card.back || '') + '</textarea>' +
          '<div class="ck-btnrow"><button class="ck-primary" type="button" data-e-save>保存</button><button class="ck-ghost" type="button" data-e-cancel>取消</button><button class="ck-ghost ck-danger" type="button" data-e-del>删除</button></div></div>';
      }
      return '<button type="button" class="cards-card-row" data-card="' + escapeHtml(card.id) + '">' + (card.tag ? '<span class="cards-card-tag">' + escapeHtml(card.tag) + '</span>' : '') +
        '<span class="cards-card-text">' + escapeHtml(card.front) + (card.back ? '<i>' + escapeHtml(card.back) + '</i>' : '') + '</span>' +
        '<span class="cards-card-side">' + (card.weight > 1 ? '×' + card.weight + ' ' : '') + (!pool.putBack && drawn.has(card.id) ? '已抽' : '') + '</span></button>';
    }).join('') + (shown.length > 400 ? '<div class="ck-sub">只列前 400 张，搜一下更快</div>' : '');
    box.querySelectorAll('button.cards-card-row').forEach(b => b.addEventListener('click', () => { editing = b.getAttribute('data-card'); drawCards(); }));
    const row = box.querySelector('.cards-card-row.editing');
    if (!row) return;
    const cardId = row.getAttribute('data-card');
    row.querySelector('[data-e-cancel]').addEventListener('click', () => { editing = ''; drawCards(); });
    row.querySelector('[data-e-save]').addEventListener('click', async () => {
      try {
        const card = (await apiRequest('/cards/pools/' + encodeURIComponent(pool.id) + '/cards/' + encodeURIComponent(cardId), { method: 'PATCH', body: { tag: row.querySelector('[data-e-tag]').value, front: row.querySelector('[data-e-front]').value, back: row.querySelector('[data-e-back]').value, weight: Number(row.querySelector('[data-e-weight]').value) || 1 } })).card;
        pool.cards = pool.cards.map(c => c.id === cardId ? card : c); editing = ''; refreshTags(); drawCards();
      } catch { toast('没保存上：正面不能空'); }
    });
    row.querySelector('[data-e-del]').addEventListener('click', async () => {
      if (!confirm('删掉这张？')) return;
      try { await apiRequest('/cards/pools/' + encodeURIComponent(pool.id) + '/cards/' + encodeURIComponent(cardId), { method: 'DELETE' }); pool.cards = pool.cards.filter(c => c.id !== cardId); pool.count--; editing = ''; refreshTags(); drawCards(); updateStat(); } catch { toast('没删掉'); }
    });
  }
  refreshTags();
  drawCards();
}
