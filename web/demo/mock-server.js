// 给你抽一张 · 演示页的「浏览器里的假后端」。
// 只在连不上真后端时启用（比如把仓库直接放到 GitHub Pages、或者用手机打开静态文件）：
// 把 server/cards 里真正的导入规则、卡池和抽卡逻辑原样搬进浏览器跑，数据存在这台设备的 localStorage 里。
// 接进你们自己的项目时用不到这个文件。
import { API_BASE } from '../config.js';

const SERVER = new URL('../../server/', import.meta.url).href;
const KEY = 'draw-cards.demo:';

// node 那几个接口的最小替身：文件读写落到 localStorage
const temp = new Map();
const fsShim = {
  readFileSync(file) { const v = localStorage.getItem(KEY + file); if (v == null) throw new Error('ENOENT'); return v; },
  writeFileSync(file, data) { temp.set(file, String(data)); },
  renameSync(from, to) { localStorage.setItem(KEY + to, temp.get(from)); temp.delete(from); },
  mkdirSync() {},
  existsSync(file) { return localStorage.getItem(KEY + file) != null; }
};
const pathShim = { join: (...parts) => parts.join('/').replace(/\/+/g, '/'), dirname: p => String(p).replace(/\/[^/]*$/, '') || '/' };
const cryptoShim = {
  randomBytes: n => ({ toString: () => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('') }),
  randomInt: n => Math.floor(Math.random() * n)
};
const processShim = { env: { DRAW_CARDS_FILE: 'demo/cards.json' }, pid: 1 };

// 极简 CommonJS 加载器：只够加载 server/cards 和 server/agent 这几个文件
const cache = new Map();
async function load(url) {
  if (cache.has(url)) return cache.get(url);
  const src = await (await fetch(url)).text();
  const deps = [...src.matchAll(/require\('(\.[^']+)'\)/g)].map(m => m[1]);
  const resolved = {};
  for (const dep of deps) resolved[dep] = await load(new URL(dep.endsWith('.js') ? dep : dep + '.js', url).href);
  const module = { exports: {} };
  const req = name => ({ fs: fsShim, path: pathShim, crypto: cryptoShim })[name] || resolved[name];
  new Function('module', 'exports', 'require', 'process', '__dirname', src)(module, module.exports, req, processShim, '/');
  cache.set(url, module.exports);
  return module.exports;
}

export async function installMockServer() {
  const store = await load(SERVER + 'cards/store.js');
  const { mountCardsRoutes } = await load(SERVER + 'cards/routes.js');
  const { createDrawTool } = await load(SERVER + 'agent/tool-contract.js');
  const drawTool = createDrawTool({ store });

  // 用真正的 routes.js 注册路由，只是把 express 换成一个收集器
  const routes = [];
  const add = method => (pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };
  const router = { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
  mountCardsRoutes(router, store);
  router.post('/demo/ta-draw', async (req, res) => {
    const pool = store.listPools().find(item => item.count > 0);
    if (!pool) return res.status(400).json({ ok: false, error: 'cards_pool_empty', message: '还没有卡池' });
    const result = await drawTool.handler({ action: 'draw', poolId: pool.id, for: 'you', count: 1, note: '给你抽了一张。' });
    res.json({ ok: true, delivery: result.delivery });
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(API_BASE + '/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const p = url.pathname.slice(API_BASE.length);
    const route = routes.find(r => r.method === method && r.re.test(p));
    let status = 200; let payload = { ok: false, error: 'not_found' };
    if (!route) status = 404;
    else {
      const m = p.match(route.re);
      const req = { params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query: Object.fromEntries(url.searchParams), body: init.body ? JSON.parse(init.body) : {}, headers: {} };
      const res = { status(code) { status = code; return res; }, json(body) { payload = body; return res; }, setHeader() {} };
      await route.handler(req, res);
    }
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };

  // 第一次打开：自动导入示范卡池，打开就能抽
  if (!store.listPools().length) {
    const text = await (await realFetch(new URL('./sample-pools.txt', import.meta.url))).text();
    store.importText(text, {});
  }
}
