# 给你抽一张 · Draw for each other

你和你的 AI 伴侣共用的一副卡池：真心话大冒险、单词卡、今天吃什么……你给 TA 抽，TA 也给你抽。

这是一个让你的 AI 伴侣（下文叫 **TA**）和你（下文叫 **YOU**）互相抽卡的小工具：

- YOU 在聊天输入框上点一下卡牌按钮，选卡池、给谁抽、一次抽几张，洗牌一秒，抽中的卡先挂在输入框上——不满意可以**重抽**或**放回**，满意了配一句话、一张表情包一起发出去
- 卡片落进对话里是背面朝上的，点一下 3D 翻面；双面卡（比如单词卡）正面是题、翻过来是答案；一次抽好几张会摊成一把扇子
- TA 有两只手：**cards_tool** 能翻开卡池看题、导入、改卡；**draw_tool** 只看得到卡池名字和还剩几张，抽中以后才知道是哪张——TA 给你抽卡时没法先偷看再挑
- 卡池可以**不放回**（一轮之内不重复，抽完自动洗牌，适合真心话、单词卡）或**放回**（每次从全部里抽，适合今天吃什么），每张卡可以带标签、带权重
- 导入是纯规则识别，不经过任何模型：在备忘录里一行写一道题就行，导入前先预览，哪一行有问题直接标出来

它不是一个独立 App，而是一组可以挂进你现有「聊天页 + Agent」的零件：一个后端模块、一组前端控件、两个给 TA 的工具。仓库里带一个演示页，不接任何东西也能先玩。

## 五步跑起来（演示页）

```bash
git clone https://github.com/isle0306ral-hub/draw-for-each-other.git && cd draw-for-each-other
npm install
cp .env.example .env        # 填 DRAW_CARDS_TOKEN（随便一串足够长的字符），本机试用可以先空着
npm start                   # 默认 http://localhost:8788
```

1. 打开 `http://localhost:8788/`，切到「设置」
2. 「导入」里选文件 `web/demo/sample-pools.txt`，点「导入」——三个示范卡池：Deep Talk 真心话 100 题、今天吃什么、单词卡
3. 回到「聊天」，点输入框右边的卡牌按钮抽一张；再点「让 TA 抽一张」，看 TA 抽的卡怎么出现在对话里

## 换成你们自己的名字

文中的 **YOU** 可以换成你的名字，**TA** 可以换成你的 AI 伴侣的名字：前端改 `web/config.js`（YOU_NAME / TA_NAME / 卡底下的「for 谁」），后端改 `.env`（DRAW_CARDS_YOU_NAME / DRAW_CARDS_TA_NAME，TA 收到的转述里用）。卡面、图标、字体、颜色也都能换，一项一项写在 [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)。

## 接进你们的聊天页

之后再一步步接进你们自己的聊天页：后端接口 → 输入框上的抽卡入口 → 消息里的卡片 → 把两个工具交给 TA → 换成你们自己的名字和卡面。每一步做完都能用，也可以停在任何一步。

## 文档

| 文档 | 给谁看 | 讲什么 |
|---|---|---|
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | 人和机 | 主文档：整体结构、每个页面和控件是干嘛的、怎么接、接到哪 |
| [docs/FOR-AGENT.md](docs/FOR-AGENT.md) | 机 | TA 的两个工具：每个动作的参数、返回、失败，以及 YOU 那边会看到什么 |
| [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) | 人 | 名字、卡面、图标、字体、颜色，哪些能换、在哪换 |
| [docs/PITFALLS.md](docs/PITFALLS.md) | 人和机 | 真实踩过的坑，尤其是 iPhone 上的 |
| [web/cards/cards-template.txt](web/cards/cards-template.txt) | 人和机 | 卡池导入模板：格式规则 + 示例，可以直接丢给 AI 让它照着整理题库 |

## 测试

```bash
npm test     # 导入规则、卡池与抽卡、TA 的两个工具、HTTP 接口
```

## 说明

- 自带的那套卡面（卡背、正面、反面）和十二个卡池小图标，是作者两个人自己的——小猫和小章鱼是我们俩的意象。拿去用的话，请换成你们自己的，换法见 docs/CUSTOMIZE.md。
- 示范卡池里的 Deep Talk 100 题由 AI 生成，问句是 TA 问 YOU 的口吻，可以随便改、随便删。
- 中文字体是霞鹜文楷 Lite（SIL OFL 1.1，授权见 `web/fonts/lxgw-wenkai-lite/LICENSE`）。
- MIT License © 2026 Lili & Kravis
