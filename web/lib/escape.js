// 给你抽一张 · 拼 HTML 前的转义。所有用户写的题目、卡池名都要过它。
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
