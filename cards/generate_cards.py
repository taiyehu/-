"""Render hand, event, or misfortune cards from CSV data.

Usage: python cards/generate_cards.py --data cards/cards.example.csv
Requires: Pillow (python -m pip install Pillow)
"""

from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
HAND_COLUMNS = ("id", "name", "move", "cost", "game_type", "effect", "condition", "art_path")
SPECIAL_COLUMNS = ("id", "name", "effect", "art_path")
TEMPLATES = {
    "hand": HERE / "template.png",
    "event": HERE / "templates" / "event.png",
    "misfortune": HERE / "templates" / "misfortune.png",
}
EXAMPLE_DATA = {
    "hand": HERE / "cards.example.csv",
    "event": HERE / "events.example.csv",
    "misfortune": HERE / "misfortunes.example.csv",
}
TEMPLATE_SIZES = {"hand": (1062, 1482), "event": (1061, 1482), "misfortune": (1061, 1482)}
GAME_IMAGES = {
    "arcaea": HERE / "assets" / "game" / "Arcaea.png",
    "phigros": HERE / "assets" / "game" / "Phigros.png",
    "fanshi": HERE / "assets" / "game" / "fanshi.png",
    "random": HERE / "assets" / "game" / "random.png",
}


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


ART = Box(92, 206, 970, 704)
DICE = Box(51, 45, 196, 190)
COST = Box(856, 80, 988, 175)
EFFECT = Box(91, 784, 971, 922)
CONDITION = Box(93, 990, 970, 1209)
NAME = Box(263, 1280, 990, 1416)
GAME_ICON = Box(65, 1279, 197, 1411)
SPECIAL_TEXT = {
    "event": (Box(98, 798, 963, 1108), Box(95, 1223, 966, 1375), "#312B66"),
    "misfortune": (Box(98, 785, 963, 1090), Box(95, 1218, 966, 1375), "#5A2025"),
}


def find_font(explicit: str | None) -> Path:
    if explicit:
        chosen = Path(explicit).expanduser()
        if not chosen.is_file():
            raise FileNotFoundError(f"指定的字体不存在：{chosen}")
        return chosen
    candidates = [
        HERE / "assets" / "fonts" / "card-font.ttf",
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("未找到中文字体；请使用 --font 指定 .ttf 或 .ttc 文件")


def resolve_art(csv_path: Path, value: str) -> Path | None:
    if not value.strip():
        return None
    path = Path(value.strip())
    if not path.is_absolute():
        path = csv_path.parent / path
    if not path.is_file():
        raise FileNotFoundError(f"插图不存在：{path}")
    return path


def wrap_pixels(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """Wrap by measured glyph width; honor manual line breaks."""
    lines: list[str] = []
    for paragraph in text.replace("\\n", "\n").split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            trial = current + char
            if current and draw.textlength(trial, font=font) > width:
                lines.append(current.rstrip())
                current = char.lstrip()
            else:
                current = trial
        lines.append(current.rstrip())
    return lines


def draw_fitted_text(
    image: Image.Image,
    value: str,
    box: Box,
    font_path: Path,
    max_size: int,
    min_size: int,
    color: str,
    field: str,
    card_id: str,
) -> None:
    text = value.strip()
    if not text:
        return
    draw = ImageDraw.Draw(image)
    for size in range(max_size, min_size - 1, -1):
        font = ImageFont.truetype(str(font_path), size)
        lines = wrap_pixels(draw, text, font, box.width)
        ascent, descent = font.getmetrics()
        line_height = round((ascent + descent) * 1.08)
        total_height = line_height * len(lines)
        if total_height <= box.height and all(draw.textlength(line, font=font) <= box.width for line in lines):
            y = box.top + (box.height - total_height) / 2
            for line in lines:
                draw.text(((box.left + box.right) / 2, y), line, font=font, fill=color, anchor="mt")
                y += line_height
            return
    raise ValueError(f"卡牌 {card_id} 的“{field}”超出文本框，请缩短内容或调整脚本中的版面参数")


def paste_art(image: Image.Image, art_path: Path, focus_x: float, focus_y: float, fit_mode: str) -> None:
    with Image.open(art_path) as opened:
        art = ImageOps.exif_transpose(opened).convert("RGBA")
    size = (ART.width, ART.height)
    if fit_mode == "cover":
        content = ImageOps.fit(art, size, method=Image.Resampling.LANCZOS, centering=(focus_x, focus_y))
        paper = Image.new("RGBA", size, "#F7F1DF")
        paper.alpha_composite(content)
    elif fit_mode == "contain":
        background = ImageOps.fit(art, size, method=Image.Resampling.LANCZOS, centering=(focus_x, focus_y))
        paper = background.filter(ImageFilter.GaussianBlur(24))
        content = ImageOps.contain(art, size, method=Image.Resampling.LANCZOS)
        paper.alpha_composite(content, ((ART.width - content.width) // 2, (ART.height - content.height) // 2))
    else:
        raise ValueError(f"未知 art_fit {fit_mode!r}；可用值：cover、contain")
    mask = Image.new("L", (ART.width, ART.height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((10, 10, ART.width - 11, ART.height - 11), radius=32, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(7))
    image.paste(paper.convert("RGB"), (ART.left, ART.top), mask)


def paste_dice(image: Image.Image, move: int) -> None:
    path = HERE / "assets" / "dice" / f"{move}.png"
    if not path.is_file():
        raise FileNotFoundError(f"缺少骰子图片：{path}")
    with Image.open(path) as opened:
        dice = opened.convert("RGBA")
    dice = ImageOps.contain(dice, (DICE.width, DICE.height), method=Image.Resampling.LANCZOS)
    x = DICE.left + (DICE.width - dice.width) // 2
    y = DICE.top + (DICE.height - dice.height) // 2
    ImageDraw.Draw(image).rounded_rectangle((DICE.left, DICE.top, DICE.right, DICE.bottom), radius=22, fill="#F7F1DF")
    image.paste(dice, (x, y), dice)


def paste_game_icon(image: Image.Image, game_type: str, move: int) -> None:
    key = "random" if move == 7 else game_type.strip().casefold()
    if key not in GAME_IMAGES:
        raise ValueError(f"未知游戏类型 {game_type!r}；可用值：Arcaea、Phigros、fanshi，点数 7 使用 random")
    if key == "random" and move != 7:
        raise ValueError("random 游戏类型仅用于 move=7 的卡牌")
    path = GAME_IMAGES[key]
    if not path.is_file():
        raise FileNotFoundError(f"缺少游戏类型图片：{path}")
    with Image.open(path) as opened:
        portrait = ImageOps.exif_transpose(opened).convert("RGBA")
    portrait = ImageOps.fit(portrait, (GAME_ICON.width, GAME_ICON.height), method=Image.Resampling.LANCZOS)
    background = Image.new("RGBA", portrait.size, "#104750")
    background.alpha_composite(portrait)
    circle = Image.new("L", portrait.size, 0)
    ImageDraw.Draw(circle).ellipse((1, 1, portrait.width - 2, portrait.height - 2), fill=255)
    image.paste(background.convert("RGB"), (GAME_ICON.left, GAME_ICON.top), circle)
    ImageDraw.Draw(image).ellipse(
        (GAME_ICON.left, GAME_ICON.top, GAME_ICON.right, GAME_ICON.bottom),
        outline="#E4BD67",
        width=4,
    )


def add_art_from_row(image: Image.Image, row: dict[str, str], csv_path: Path, card_id: str) -> None:
    art_path = resolve_art(csv_path, row["art_path"])
    if not art_path:
        return
    try:
        focus_x = float(row.get("art_focus_x", "") or 0.5)
        focus_y = float(row.get("art_focus_y", "") or 0.5)
    except ValueError as exc:
        raise ValueError(f"卡牌 {card_id} 的插图焦点必须是 0 到 1 之间的数字") from exc
    if not (0 <= focus_x <= 1 and 0 <= focus_y <= 1):
        raise ValueError(f"卡牌 {card_id} 的插图焦点必须在 0 到 1 之间")
    paste_art(image, art_path, focus_x, focus_y, (row.get("art_fit", "") or "cover").strip().lower())


def render_card(row: dict[str, str], template: Image.Image, csv_path: Path, font_path: Path) -> Image.Image:
    card_id = row["id"].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", card_id):
        raise ValueError(f"卡牌编号只能使用英文字母、数字、- 和 _：{card_id!r}")
    for field in ("name", "move", "cost", "game_type"):
        if not row[field].strip():
            raise ValueError(f"卡牌 {card_id} 缺少 {field}")
    if not row["move"].strip().isdigit() or int(row["move"]) not in range(1, 8):
        raise ValueError(f"卡牌 {card_id} 的 move 必须是 1 到 7 的整数；7 表示问号图标")
    if not row["cost"].strip().isdigit():
        raise ValueError(f"卡牌 {card_id} 的 cost 必须为非负整数")

    image = template.copy().convert("RGB")
    add_art_from_row(image, row, csv_path, card_id)

    paste_dice(image, int(row["move"]))
    paste_game_icon(image, row["game_type"], int(row["move"]))
    draw_fitted_text(image, row["cost"], COST, font_path, 55, 30, "#604317", "金钱费用", card_id)
    draw_fitted_text(image, row["effect"], EFFECT, font_path, 42, 24, "#173F43", "卡牌效果", card_id)
    draw_fitted_text(image, row["condition"], CONDITION, font_path, 39, 23, "#63491F", "使用条件", card_id)
    draw_fitted_text(image, row["name"], NAME, font_path, 57, 30, "#153D45", "卡牌名字", card_id)
    return image


def render_special_card(
    row: dict[str, str], template: Image.Image, csv_path: Path, font_path: Path, kind: str
) -> Image.Image:
    card_id = row["id"].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", card_id):
        raise ValueError(f"卡牌编号只能使用英文字母、数字、- 和 _：{card_id!r}")
    for field in ("name", "effect"):
        if not row[field].strip():
            raise ValueError(f"卡牌 {card_id} 缺少 {field}")
    image = template.copy().convert("RGB")
    add_art_from_row(image, row, csv_path, card_id)
    effect_box, name_box, color = SPECIAL_TEXT[kind]
    draw_fitted_text(image, row["effect"], effect_box, font_path, 50, 26, color, "卡牌效果", card_id)
    draw_fitted_text(image, row["name"], name_box, font_path, 64, 32, color, "卡牌名字", card_id)
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description="使用 CSV 批量生成手牌、事件牌或厄运牌 PNG")
    parser.add_argument("--kind", choices=TEMPLATES, default="hand", help="卡牌种类，默认 hand")
    parser.add_argument("--data", type=Path, help="UTF-8 CSV 数据文件；默认使用该种类的示例")
    parser.add_argument("--template", type=Path, help="覆盖默认卡牌模板 PNG")
    parser.add_argument("--output", type=Path, default=HERE / "output", help="输出目录")
    parser.add_argument("--font", help="中文字体 .ttf/.ttc；默认自动查找")
    args = parser.parse_args()

    csv_path = (args.data or EXAMPLE_DATA[args.kind]).resolve()
    font_path = find_font(args.font)
    template_path = args.template or TEMPLATES[args.kind]
    with Image.open(template_path) as opened:
        template = opened.convert("RGB")
    expected_size = TEMPLATE_SIZES[args.kind]
    if template.size != expected_size:
        raise ValueError(f"{args.kind} 模板应为 {expected_size} 像素，实际为 {template.size}")

    with csv_path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = HAND_COLUMNS if args.kind == "hand" else SPECIAL_COLUMNS
        missing = set(required) - set(reader.fieldnames or ())
        if missing:
            raise ValueError("CSV 缺少列：" + ", ".join(sorted(missing)))
        rows = list(reader)
    if not rows:
        raise ValueError("CSV 没有卡牌数据")
    ids = [row["id"].strip() for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("CSV 中存在重复的卡牌编号")

    args.output.mkdir(parents=True, exist_ok=True)
    for row in rows:
        if args.kind == "hand":
            image = render_card(row, template, csv_path, font_path)
        else:
            image = render_special_card(row, template, csv_path, font_path, args.kind)
        destination = args.output / (row["id"].strip() + ".png")
        image.save(destination, dpi=(300, 300), optimize=True)
        print(destination)
    print(f"完成：{len(rows)} 张卡牌")


if __name__ == "__main__":
    main()
