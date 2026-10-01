// 给你抽一张 · 前端跟后端说话的唯一出口。
// 路径都写成 '/cards/...'，前面自动拼上 config.js 的 API_BASE；鉴权头按你们宿主的方式改 authHeaders()。
import { API_BASE } from '../config.js';

function authHeaders() {
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('draw-cards.token')) || '';
  return token ? { Authorization: 'Bearer ' + token } : {};
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) { super(message || 'Request failed'); this.status = status; this.code = code; }
}

export async function apiRequest(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: Object.assign({ Accept: 'application/json' }, authHeaders()) };
  if (opts.body !== undefined && init.method !== 'GET') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const res = await fetch(API_BASE + path, init);
  let body = null; try { body = await res.json(); } catch (_) {}
  if (!res.ok || (body && body.ok === false)) {
    // 后端错误是 { ok:false, error:代码 }；message 里带上代码，调用方用 includes() 判断是哪种
    throw new ApiError((body && (body.message || body.error)) || ('Request failed (' + res.status + ')'), { status: res.status, code: (body && body.error) || '' });
  }
  return body;
}
