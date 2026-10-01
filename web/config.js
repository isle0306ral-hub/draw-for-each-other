// 给你抽一张 · 个性化都在这儿改（详见 docs/CUSTOMIZE.md）
// YOU 是人，TA 是你的 AI 伴侣。界面上出现的称呼都从这里取。
export const YOU_NAME = 'YOU';      // 抽卡面板「给我自己」以外的地方提到人时用
export const TA_NAME = 'TA';        // 抽卡面板「给 TA」、待发区「给 TA 抽了几张」
// 翻开卡片底下那行小字：给 YOU 的卡、给 TA 的卡分别写什么
export const FOR_LABEL = { you: 'for you', ta: 'for TA' };
// 后端接口前缀，要和 server 里 mountCardsRoutes 挂的位置一致（默认 /api，最终是 /api/cards/*）
export const API_BASE = (typeof window !== 'undefined' && window.DRAW_CARDS_API_BASE) || '/api';
