// 卡面。一套卡面两组：抽给 YOU 的（you）、抽给 TA 的（ta）。换卡面见 docs/CUSTOMIZE.md。
// 每组三张：back 卡背、front 写题的那面、answer 双面卡的反面。
// textBox 是题目落在卡面上的区域（百分比），textColor / tagColor / font 跟着卡面走。
// 自带的这套是作者自己的（小猫与小章鱼），拿去用请换成你们自己的图。
const BASE = new URL('./skins/', import.meta.url).href;

export const BUILTIN_SKINS = Object.freeze([
  Object.freeze({
    id: 'default',
    name: '小猫与小章鱼（示例，请换成你们自己的）',
    groups: Object.freeze({
      you: Object.freeze({
        back: BASE + 'default/you/back.webp',
        front: BASE + 'default/you/front.webp',
        answer: BASE + 'default/you/answer.webp',
        textColor: '#5e4a52',
        tagColor: '#9b7f8a',
        tagBg: 'rgba(255,255,255,.55)'
      }),
      ta: Object.freeze({
        back: BASE + 'default/ta/back.webp',
        front: BASE + 'default/ta/front.webp',
        answer: BASE + 'default/ta/answer.webp',
        textColor: '#3f4a55',
        tagColor: '#6f8394',
        tagBg: 'rgba(255,255,255,.6)'
      })
    }),
    textBox: Object.freeze({ x: 14, y: 20, w: 72, h: 60 }),
    font: '"LXGW WenKai Lite", "LXGW WenKai", "Noto Serif SC", "Songti SC", serif',
    numberFont: '"Cormorant Garamond", "Bodoni Moda", serif'
  })
]);

export const DEFAULT_SKIN_ID = 'default';

export const POOL_ICONS = Object.freeze(
  ['moon', 'sun', 'heart', 'book', 'noodles', 'card', 'kitten', 'octopus', 'rose', 'balloon', 'music', 'dice']
    .map(id => Object.freeze({ id, url: new URL('./icons/' + id + '.webp', import.meta.url).href }))
);

export function skinById(id) {
  return BUILTIN_SKINS.find(skin => skin.id === id) || BUILTIN_SKINS[0];
}

export function iconUrl(icon) {
  if (!icon) return POOL_ICONS[5].url;
  if (/^(\/|https?:\/\/|\.)/.test(icon)) return icon;   // 也可以直接填你自己的图片地址
  const found = POOL_ICONS.find(item => item.id === icon);
  return found ? found.url : POOL_ICONS[5].url;
}
