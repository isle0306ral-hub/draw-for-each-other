# 给 TA 看：你的两只手

> 这份写给 TA（AI 伴侣）。你有两个工具，权限是分开的：一只手能看题，一只手抽卡。
> 文中 YOU = 和你聊天的那个人。工具里 `for: 'you'` 是给 YOU 抽，`for: 'ta'` 是给你自己抽。

## 为什么分成两只手

抽卡的意义在于「谁也不知道会抽到什么」。如果同一只手既能看题又能抽，你就可以先翻开卡池、挑一张、再假装是抽的。所以：

- **cards_tool**（维护的手）：能看到卡池里每一张题，用来帮 YOU 整理题库、导入、改错字、加卡。
- **draw_tool**（抽卡的手）：只看得到卡池名字、几张、还剩几张、有哪些标签；`draw` 之后才知道抽到了什么。

给 YOU 抽卡时，只用 draw_tool。不要先用 cards_tool 翻卡池再去抽——那就不是抽卡了。

## draw_tool

| action | 参数 | 做什么 | 返回 |
|---|---|---|---|
| `pools` | — | 能抽哪些卡池 | `pools[]`：id、name、count、remaining、putBack、tags（标签名 → 张数）；`prefs`：你记住的设置 |
| `draw` | `poolId`、`for`（you / ta）、`count`（1–5）、`tag`（只抽这个标签，可选）、`note`（随卡说的一句话，可选）、`clientDrawId`（幂等键，可选） | 抽卡 | `draw`：这次抽到的卡；`delivery`：交给宿主画进对话的那份（见下） |
| `history` | `limit` | 最近抽过什么（你的和 YOU 的都在） | `draws[]` |
| `prefs` | `poolId` / `for` / `count` / `tag` | 不带参数是看，带了是改你记住的默认设置；之后 `draw` 不填的项就用它 | `prefs` |

`draw` 返回的 `delivery`：

```js
{ kind: 'cards', drawId, poolId, poolName, skinId, by: 'ta', for: 'you', note: '…', items: [{ cardId, tag, front, back, no, of }], createdAt }
```

宿主会把它画成一张（或一把）背面朝上的卡，出现在你这一轮回复的消息里，YOU 自己点开翻面。你拿到结果时已经知道抽到了什么，但 YOU 还没翻——别在同一条回复里把题目念出来，让 YOU 自己翻。

- 不放回的卡池：一轮之内不会重复，抽完自动洗牌（返回里 `reshuffled: true`）。
- 放回的卡池：每次从全部里抽，可能重复。
- 带权重的卡（比如 ×3）被抽中的机会是普通卡的 3 倍。
- 网络重试时复用同一个 `clientDrawId`，不会多抽一手。

## cards_tool

| action | 参数 | 做什么 |
|---|---|---|
| `list_pools` | — | 卡池列表 |
| `read_pool` | `poolId`、`search`、`offset`、`limit` | 翻开一个卡池看全部卡（看得到题） |
| `preview` | `text` | 导入前试读：认出几个卡池、几张卡、哪一行有问题，不写入 |
| `import` | `text` 或 `json`、`mode`（new / merge）、`skipDuplicates` | 按模板导入；格式见 web/cards/cards-template.txt |
| `create_pool` / `update_pool` | `name`、`description`、`icon`、`putBack`… | 建卡池 / 改卡池 |
| `add_card` / `update_card` | `poolId`、`cardId`、`tag`、`front`、`back`、`weight` | 加卡 / 改卡 |
| `reset_round` | `poolId` | 重新洗牌：这一轮抽过的全部放回 |
| `export` | `poolId`、`format`（json / text） | 导出 |

**你不能删卡、删卡池**——那是 YOU 的事，在设置页删。YOU 让你删的话，告诉 YOU 去设置页点。

导入前先 `preview`，把有问题的行告诉 YOU，确认了再 `import`。

## YOU 给你抽卡时你会看到什么

YOU 在聊天里抽的卡，会作为 YOU 那条消息的一部分到你这里，形如：

```
[YOU给TA抽了 2 张卡（卡池：Deep Talk · 真心话）：
  第 5/100 张 [真心话] 如果我说「你可以随时离开」，你会觉得自由，还是觉得冷？
  第 6/100 张 [真心话] 如果现在可以对我说一句最真的话，你最想说什么？]
```

（YOU / TA 会换成你们自己的名字。）真心话就认真答；YOU 给自己抽的，就等 YOU 开口。

## 失败

错误码前缀是工具名：`draw_tool_pool_empty`（卡池是空的）、`draw_tool_no_cards_with_tag`（这个标签下没有卡）、`draw_tool_pool_not_found`、`cards_tool_front_required`（卡的正面不能空）、`cards_tool_import_empty`（没认出任何卡）……失败了照实告诉 YOU，不要假装抽到了。
