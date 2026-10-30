# 批量制作卡牌

将每张卡的信息写在 CSV 的一行。脚本可制作三种卡：手牌使用骰子、费用、游戏类型图标、效果、条件和卡名；事件牌与厄运牌使用上方插图、效果和卡名。三种卡分别使用 `template.png`、`templates/event.png`、`templates/misfortune.png`。

游戏 demo 使用 `hand.csv`、`events.csv`、`misfortunes.csv` 作为正式牌面数据。这三份文件在原有制卡列之外增加 `effect_type`、`effect_value` 和 `quantity`；制卡脚本会忽略额外列。编辑后可用下方命令重新生成图片，随后重启 demo 服务器以载入新数据。

```powershell
python cards/generate_cards.py --data cards/hand.csv
python cards/generate_cards.py --kind event --data cards/events.csv
python cards/generate_cards.py --kind misfortune --data cards/misfortunes.csv
```

## 使用

```powershell
python -m pip install Pillow
python cards/generate_cards.py --data cards/cards.example.csv
python cards/generate_cards.py --kind event --data cards/events.example.csv
python cards/generate_cards.py --kind misfortune --data cards/misfortunes.example.csv
```

默认输出到 `cards/output/`。制作正式卡牌时，复制对应种类的示例 CSV，填写每张卡的数据，再用 `--data` 指向新文件：

```powershell
python cards/generate_cards.py --data cards/my-cards.csv --output cards/rendered
python cards/generate_cards.py --kind event --data cards/my-events.csv --output cards/rendered
```

| 列名 | 内容 |
| --- | --- |
| `id` | 唯一的文件名编号，只能使用英文字母、数字、`-`、`_`。 |
| `name` | 底部的卡牌名字。 |
| `move` | 左上角图标编号：`1`–`6` 对应骰子图，`7` 对应问号图；图片取自 `assets/dice/` 的同名 PNG。 |
| `cost` | 右上角发动费用，非负整数。 |
| `game_type` | 左下角游戏类型图标：`Arcaea`、`Phigros` 或 `fanshi`。`move=7` 时固定改用 `assets/game/random.png`，该列可填 `random`。 |
| `effect` | 第一个文本框：卡牌效果。 |
| `condition` | 第二个文本框：使用条件。 |
| `art_path` | 上方插图路径；相对路径以 CSV 所在文件夹为起点，留空则保留模板背景。 |
| `art_fit` | 可选：`cover` 铺满并裁切（默认），`contain` 保留完整图片并用模糊背景填边。 |
| `art_focus_x`、`art_focus_y` | 可选，插图裁切焦点，范围 `0` 到 `1`，默认均为 `0.5`。 |

事件牌和厄运牌的 CSV 只需 `id`、`name`、`effect`、`art_path` 四个必需列；`art_fit` 和裁切焦点仍可选。事件牌的效果显示在中部大框、卡名显示在底框；厄运牌同理。运行时用 `--kind event` 或 `--kind misfortune` 选择模板。

CSV 用 UTF-8 编码。单元格内需要换行时，可写 `\n`；也可在引号包围的单元格内直接换行。若文字在最小字号下仍放不进文本框，脚本会报错并指出卡牌编号及字段，不会静默截断。默认字体是 `assets/fonts/card-font.ttf`；可通过 `--font` 指定其他字体。

骰子和游戏类型图片已保存在 `assets/`；卡牌插图单独放在 `art/`。替换同名 PNG 即可更换整套卡牌上的对应图标；上方的大幅插图由各行的 `art_path` 分别指定。示例卡使用 `art/example.png` 和 `contain`，以保留整张方形图片。

手牌模板大小为 **1062 × 1482 像素**，事件和厄运模板为 **1061 × 1482 像素**。脚本导出的 PNG 附有 300 DPI 元数据；实际印刷尺寸和出血边需要在印前确认。
