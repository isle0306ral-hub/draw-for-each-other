# 接入指南

> 这份文档写给两种读者：接入它的人，和将来要用它的机（TA）。人按章节一步步做；机重点读第 5、6 节和 FOR-AGENT.md。
> 文中：**YOU** = 拿手机聊天的人；**TA** = 你的 AI 伴侣；**宿主** = 你们已有的聊天页和 Agent 运行时。

## 0. 整体长什么样

```
 YOU 的手机（网页 / PWA）                         你的服务器
 ┌─────────────────────────────┐  /api/cards/*  ┌─────────────────────────────┐
 │ 设置页「卡池」 settings-cards │ ─────────────▶ │ server/cards/                │
 │ 输入框抽卡入口 draw-panel     │ ◀───────────── │  ├ parse.js  导入规则（纯函数）│
 │ 消息里的卡片   card-view      │                │  ├ store.js  卡池 / 抽卡 / 记录│
 └─────────────────────────────┘                │  ├ routes.js YOU 用的接口      │
        ▲  YOU 发消息时带上 cards: [drawId]       │  └ describe.js 卡并进消息     │
        │                                         │ server/agent/tool-contract.js │
        └──── 宿主把卡存进消息、转述给 TA ◀────── │  ├ cards_tool  维护（看得到题）│
                                     TA ◀──────▶ │  └ draw_tool   盲抽（看不到题）│
                                        工具调用  └─────────────────────────────┘
```

- 卡池、抽卡记录都存在服务器一份（`DRAW_CARDS_DATA_DIR/cards.json`），所以 TA 和 YOU 抽的是同一副牌，不放回的卡池两个人抽也不会重复。
- **抽卡永远在服务器上做**：权重、不放回、抽完洗牌都在 `store.js`。前端和 TA 都只说「从哪个卡池、给谁、几张」，抽出来是什么由服务器决定。

文件地图：

| 位置 | 是什么 |
|---|---|
| `server/cards/parse.js` | 导入规则：TXT 一行一张卡、JSON 互转，逐行给出问题 |
| `server/cards/store.js` | 卡池增删改、导入导出、抽卡（权重 / 不放回 / 按标签 / 一次 1–5 张 / 幂等）、放回作废、两个人各自的抽卡偏好 |
| `server/cards/routes.js` | `mountCardsRoutes(router, store)`：YOU 那一侧的 HTTP 接口 |
| `server/cards/describe.js` | YOU 发出的卡怎么存进消息、怎么写成一段文字给 TA |
| `server/agent/tool-contract.js` | TA 的两个工具 `cards_tool` / `draw_tool` |
| `server/example-server.js` | 最小接线示例（含演示页用的「让 TA 抽一张」） |
| `web/config.js` | 称呼、卡底下那行「for 谁」、接口前缀 |
| `web/cards/card-view.js` | 消息里的卡片：发牌、翻面、扇形 |
| `web/cards/draw-panel.js` | 输入框上的抽卡入口：按钮图标、抽卡面板、待发区 |
| `web/cards/settings-cards.js` | 设置页「卡池」 |
| `web/cards/skins.js` + `skins/` + `icons/` | 卡面和卡池小图标 |
| `web/styles/cards.css` | 以上所有的样式 |
| `web/index.html` + `web/demo/` | 演示页（假聊天框 + 设置），`demo/sample-pools.txt` 是示范卡池 |

## 1. 后端：挂接口

不用 `server/example-server.js` 的话，照它做三件事：

1. `mountCardsRoutes(router, require('./server/cards/store'))`，把 router 挂到 `/api` 下（路由自带 `/cards` 前缀），外面包你自己的鉴权
2. 把 `web/` 当静态文件发出去，或者把 `web/cards/`、`web/lib/`、`web/config.js`、`web/styles/cards.css`、`web/fonts/` 拷进你的前端工程
3. 前端 `web/config.js` 的 `API_BASE` 对上你的前缀，`web/lib/api.js` 的 `authHeaders()` 改成你们的鉴权方式

导入整本题库时请求体会比较大，`express.json({ limit })` 至少给到 `5mb`。

## 2. 设置页「卡池」

- **怎么挂**：`import { mountCards } from './cards/settings-cards.js'; mountCards({ host })`，`host` 是你设置页里一块空容器。
- **页面上有什么**：
  - 卡池列表：图标、名字、几张、剩几张、各标签几张；点进去编辑；最下面「新建一个空卡池」
  - 导入：粘贴文本或选 `.txt` / `.json` 文件 → 下面当场预览「认出几个卡池、几张卡、哪一行有什么问题」 → 有内容了才出现「导入到：新建卡池 / 并进同名卡池」 → 「导入 N 张卡」。右上角「下载模板」
  - 页脚：导出全部卡池（JSON / TXT）
  - 卡池详情：大图标 + 名字、一句话说明、十二个图标里挑一个、抽法（不放回 / 放回）、保存；「卡」区可以搜题、按标签筛、点一张就地改、删；「+ 加一张」默认收起；最下面是重新洗牌、导出、删除卡池（删除要确认两次）
- 这一页**看得到题**，是维护用的；抽卡在聊天里抽，抽之前看不到。

## 3. 聊天页入口：按钮 → 抽卡面板 → 待发区

照 `web/demo/demo.js` 里标了「接线」的四处接。页面里先引样式和字体：

```html
<link rel="stylesheet" href="/fonts/lxgw-wenkai-lite/lxgwwenkailite-regular.css">
<link rel="stylesheet" href="/styles/cards.css">
```

在输入框附近放三样东西：输入框上方两个空容器（抽卡面板、待发区），按钮行里一个按钮：

```html
<div class="cards-panel" data-cards-panel hidden></div>
<div data-pending hidden></div>
<!-- …你的输入框… -->
<button type="button" data-cards-toggle aria-label="抽卡"></button>
```

```js
import { DrawPanel, DRAW_BUTTON_SVG } from '/cards/draw-panel.js';
import { cardsMarkup, bindCardClicks } from '/cards/card-view.js';

bindCardClicks();                                            // 接线 1：卡片点击翻面，全局绑一次
button.innerHTML = DRAW_BUTTON_SVG;                          // 线条图标，currentColor，22px 左右
const drawer = new DrawPanel({                               // 接线 2
  panel: document.querySelector('[data-cards-panel]'),
  pending: document.querySelector('[data-pending]'),
  onChange: syncSendButton,                                  // 待发区变了：只有卡、没有字也要能发
  isBusy: () => taIsReplying                                 // 可选：TA 正在回的时候不让抽
});
button.addEventListener('click', () => drawer.toggle());

// 接线 4：发消息时把待发的卡一起带走
const cards = drawer.takeCards();                            // drawId 数组，最多一手
sendToYourBackend({ text, cards });
```

- **抽卡面板**：顶上一行常驻当前卡池、给谁、几张、还剩几张，点「换」展开选卡池 / 只抽某个标签 / 给谁（给 TA / 给我自己）/ 一次几张。选过一次就记在服务器上，下次打开还是这个。张数超过这一轮剩下的，按钮会写实际能抽几张，并提示一句。
- **待发区**：抽中的卡先挂在输入框上方，显示给谁、哪个卡池、每张的题（YOU 自己抽的，能看到题）。「重抽」= 这一手放回再抽一手；「放回」= 不抽了。放回的卡回到这一轮，下次还可能抽到。**发出去以后就不能放回了**（服务器把关）。
- 宿主的发送按钮判断「能不能发」时，要把 `drawer.hasCards()` 算进去。

## 4. 消息里的卡片

```js
container.innerHTML = cardsMarkup(message.cards, isFromYou ? 'user' : 'assistant');
```

- `message.cards` 是一组 draw（一次抽卡），每个长这样（和第 5、6 节存下来的一致）：
  `{ drawId, poolName, skinId, by: 'you'|'ta', for: 'you'|'ta', note?, items: [{ cardId, tag, front, back, no, of }], createdAt }`
- 单面卡背面朝上落下来，点一下翻开，再点翻回去；第一次翻开有一道光扫过、几颗星点。双面卡（`back` 不空）一出来正面朝上，点一下看反面，正反面用 Ⅰ / Ⅱ 标。
- 一次几张：摊成一把扇子，最右边那张在最上面；点被压着的一张先把它抽到最上面，再点才翻。
- 抽卡后 3 分钟内第一次渲染会播发牌动画；翻到哪一面记在内存里，重绘不丢。尊重系统的「减弱动态效果」。
- YOU 的卡贴右边、TA 的卡贴左边，跟各自的气泡对齐；`note` 是 TA 抽卡时附的一句话，画成一个普通气泡。

## 5. YOU 发卡时，后端怎么接（给机看）

YOU 的消息里只有 `cards: [drawId, ...]`，卡面以服务器的抽卡记录为准：

```js
const { resolveYouDraws, describeDraws } = require('./server/cards/describe');
const draws = resolveYouDraws(store, body.cards);   // 只认 by:'you'、没作废的；同时标记成「已发出」，之后不能放回
message.cards = draws;                               // 存进这条消息，前端照第 4 节画
taInputText += '\n' + describeDraws(draws);          // 并进 TA 这一轮收到的文字
```

`describeDraws` 写出来是这样（称呼来自环境变量 `DRAW_CARDS_YOU_NAME` / `DRAW_CARDS_TA_NAME`）：

```
[YOU给TA抽了 2 张卡（卡池：Deep Talk · 真心话）：
  第 5/100 张 [真心话] 如果我说「你可以随时离开」，你会觉得自由，还是觉得冷？
  第 6/100 张 [真心话] 如果现在可以对我说一句最真的话，你最想说什么？]
```

前端没法伪造一张卡塞进消息：drawId 必须是服务器上 YOU 真抽过的。

## 6. TA 抽的卡怎么进对话（给机看）

把 `server/agent/tool-contract.js` 的 `createCardsTool({ store })`、`createDrawTool({ store })` 注册成 TA 的工具（`name` / `description` / `inputSchema` / `handler`）。参数和返回见 FOR-AGENT.md。

`draw_tool` 的 `draw` 动作返回里带 `delivery`：

```js
{ kind: 'cards', drawId, poolId, poolName, skinId, by: 'ta', for: 'you'|'ta', note, items, createdAt }
```

宿主拿到它，把它放进 TA 这一轮回复那条消息的 `cards` 里，前端用 `cardsMarkup(cards, 'assistant')` 画出来。YOU 看到的是背面朝上的卡，自己点开。

## 7. 接口一览（YOU 那一侧，前缀 /api）

| 方法 | 路径 | 做什么 |
|---|---|---|
| GET | /cards/pools | 卡池列表 + YOU 的抽卡偏好 |
| GET | /cards/pools/:poolId | 一个卡池的全部卡（维护用，看得到题） |
| POST / PATCH / DELETE | /cards/pools[/:poolId] | 新建 / 改名、说明、图标、放回与否 / 删除 |
| POST | /cards/pools/:poolId/reset | 重新洗牌 |
| POST / PATCH / DELETE | /cards/pools/:poolId/cards[/:cardId] | 加卡 / 改卡 / 删卡 |
| POST | /cards/preview | 导入前试读：认出几个卡池几张卡、哪行有问题，不写入 |
| POST | /cards/import | 导入 `{ text \| json, mode: 'new'\|'merge' }` |
| GET | /cards/export?format=json\|text&poolId= | 导出 |
| GET / PUT | /cards/prefs | YOU 的抽卡偏好 |
| POST | /cards/draw | 抽卡 `{ poolId, for, count, tag, clientDrawId }`，by 永远是 you |
| POST | /cards/draws/:drawId/void | 放回还没发出去的一手 |
| GET | /cards/draws | 最近的抽卡记录 |

错误统一是 `{ ok:false, error: 代码 }`：`*_not_found` 是 404，格式类问题是 400。
