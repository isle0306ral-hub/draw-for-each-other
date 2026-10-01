# 个性化：换成你们自己的

> 这个工具里有两个人：**YOU**（你，拿手机聊天的人）和 **TA**（你的 AI 伴侣）。
> 所有出现 YOU / TA 的地方，都可以换成你们自己的名字。下面每一项都写了：改什么、在哪改、改完哪里变。

## 1. 名字：YOU 换成你的名字，TA 换成你的 AI 伴侣的名字

一共两处，前端一处、后端一处。

**前端 `web/config.js`**

```js
export const YOU_NAME = 'YOU';                         // 换成你的名字，比如 '小满'
export const TA_NAME = 'TA';                           // 换成你的 AI 伴侣的名字，比如 '阿澈'
export const FOR_LABEL = { you: 'for you', ta: 'for TA' };   // 翻开的卡底下那行小字，比如 { you: 'for 小满', ta: 'for 阿澈' }
```

改完以后变的地方：抽卡面板「给 TA」→「给 阿澈」；待发区「给 TA 抽了 2 张」；卡片底下「for TA」；TA 还没回完时的提示「等 TA 回完这一条再抽」。

**后端 `.env`**

```
DRAW_CARDS_YOU_NAME=小满
DRAW_CARDS_TA_NAME=阿澈
```

改完以后变的地方：你给 TA 抽卡时，TA 收到的那段文字，会从「[YOU给TA抽了 2 张卡……]」变成「[小满给阿澈抽了 2 张卡……]」。

> 代码里的 `you` / `ta`（比如 `for: 'ta'`、`by: 'you'`）是内部代号，**不用改**，也不要改——前后端和 TA 的工具都靠它对上号。要改的只是上面这两处显示出来的名字。

给 AI 改的话，可以直接把这一句发给它：「把 web/config.js 里的 YOU_NAME 改成 X、TA_NAME 改成 Y、FOR_LABEL 改成 for X / for Y；把 .env 里的 DRAW_CARDS_YOU_NAME 改成 X、DRAW_CARDS_TA_NAME 改成 Y。其他地方的 you / ta 不要动。」

## 2. 卡面（卡背、正面、反面）

自带的那套是作者自己的（小猫与小章鱼），请换成你们的。一套卡面两组：抽给 YOU 的、抽给 TA 的，每组三张：

```
web/cards/skins/default/you/back.webp     卡背（背面朝上时看到的）
web/cards/skins/default/you/front.webp    正面（印题目的那面）
web/cards/skins/default/you/answer.webp   反面（双面卡翻过来，印答案的那面）
web/cards/skins/default/ta/…              同上，抽给 TA 的那组
```

- 文件名不变、直接替换就行。比例 **2:3**（宽:高），建议 600×900，webp / png / jpg 都可以（换格式的话，把 `web/cards/skins.js` 里对应的文件名一起改了）。
- 图的四个角最好是透明的圆角，不要留白边或黑边——iPhone 上会露出来（见 PITFALLS.md）。
- 正面和反面中间要留出一块干净的地方印字。

**`web/cards/skins.js`** 里还能改：

| 字段 | 是什么 |
|---|---|
| `textColor` | 题目文字的颜色（每组各一个） |
| `tagColor` / `tagBg` | 卡上「真心话」那种小标签的字色 / 底色 |
| `textBox: { x, y, w, h }` | 题目印在卡面哪一块，单位是百分比：离左边 x%、离上边 y%、宽 w%、高 h%。换了卡面以后，字压到花纹上就调这个 |
| `font` | 题目的字体（CSS font-family）。默认霞鹜文楷 Lite，字体文件在 `web/fonts/` |
| `numberFont` | 卡底下 Ⅰ / Ⅱ 和「for 谁」的字体 |

## 3. 卡池小图标

`web/cards/icons/` 下十二个 128×128 的圆形小图（moon / sun / heart / book / noodles / card / kitten / octopus / rose / balloon / music / dice）。

- 换图：同名替换。
- 加一个：放一张新图进去，再在 `web/cards/skins.js` 的 `POOL_ICONS` 列表里加上它的名字。
- 也可以不用这些：卡池的 `icon` 字段直接填一个图片地址（`/` 或 `https://` 开头），就会用那张图。

## 4. 颜色和样子

- 抽卡面板、按钮的深色：`web/styles/cards.css` 里搜 `#67616b`，换成你们页面的主色。
- 页面没有定义 `--ink` / `--line` / `--serif-cn` / `--ui` 这几个变量的话，`cards.css` 开头给了默认值；你们定义了就自动用你们的。
- 扇子摊开的角度：`web/cards/card-view.js` 里的 `FAN_STEP`（每张之间差几度）；扇子外框宽度：`cards.css` 里的 `.dc-draw-hand-N .dc-draw-cards{width}`。

## 5. 卡池和题目

不用改代码：在设置页导入、编辑就行。导入格式见 `web/cards/cards-template.txt`，那份模板可以整份发给 AI，让它把你的原始题目整理成能导入的格式。
