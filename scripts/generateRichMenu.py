from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 2500, 843
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "rich-menu-4-columns.png"
FONT = Path("C:/Windows/Fonts/meiryo.ttc")
FONT_BOLD = Path("C:/Windows/Fonts/meiryob.ttc")


def font(size, bold=False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT), size)


image = Image.new("RGB", (WIDTH, HEIGHT), "#FFF8EF")
draw = ImageDraw.Draw(image)

draw.rectangle((0, 0, WIDTH, 106), fill="#18181B")
draw.text((92, 27), "REVIEW SHOKUNIN", font=font(38, True), fill="#FB923C")
draw.text((WIDTH - 92, 32), "口コミレビュー職人", font=font(30, True), fill="#FFFFFF", anchor="ra")

items = [
    ("開始", "口コミを作る", "pencil"),
    ("募集店", "掲載店を探す", "store"),
    ("マイページ", "ランキング・バッジ", "card"),
    ("使い方", "操作ガイド", "help"),
]

card_top = 146
card_bottom = HEIGHT - 54
gap = 26
margin = 42
card_width = (WIDTH - margin * 2 - gap * 3) // 4


def draw_icon(kind, cx, cy):
    orange = "#F97316"
    dark = "#27272A"
    draw.ellipse((cx - 76, cy - 76, cx + 76, cy + 76), fill="#FFF1E6", outline="#FDBA74", width=5)
    if kind == "pencil":
        draw.line((cx - 36, cy + 34, cx + 38, cy - 40), fill=orange, width=22)
        draw.polygon([(cx + 35, cy - 43), (cx + 54, cy - 55), (cx + 46, cy - 31)], fill=dark)
        draw.line((cx - 49, cy + 48, cx - 24, cy + 39), fill=dark, width=10)
    elif kind == "store":
        draw.rectangle((cx - 47, cy - 12, cx + 47, cy + 47), outline=dark, width=9)
        draw.polygon([(cx - 58, cy - 13), (cx - 41, cy - 48), (cx + 41, cy - 48), (cx + 58, cy - 13)], fill=orange)
        draw.rectangle((cx - 12, cy + 10, cx + 13, cy + 47), fill=orange)
    elif kind == "card":
        draw.rounded_rectangle((cx - 55, cy - 43, cx + 55, cy + 48), radius=12, outline=dark, width=9)
        draw.ellipse((cx - 37, cy - 23, cx - 7, cy + 7), fill=orange)
        draw.line((cx - 42, cy + 24, cx + 38, cy + 24), fill=orange, width=9)
        draw.line((cx + 10, cy - 16, cx + 39, cy - 16), fill=dark, width=8)
    else:
        draw.ellipse((cx - 47, cy - 47, cx + 47, cy + 47), outline=dark, width=10)
        draw.text((cx, cy - 9), "?", font=font(72, True), fill=orange, anchor="mm")


for index, (label, subtitle, icon) in enumerate(items):
    left = margin + index * (card_width + gap)
    right = left + card_width
    draw.rounded_rectangle(
        (left, card_top, right, card_bottom),
        radius=34,
        fill="#FFFFFF",
        outline="#E7E5E4",
        width=4,
    )
    center = (left + right) // 2
    draw_icon(icon, center, 310)
    draw.text((center, 472), label, font=font(54, True), fill="#18181B", anchor="mm")
    draw.text((center, 550), subtitle, font=font(28), fill="#78716C", anchor="mm")
    draw.rounded_rectangle((left + 78, 625, right - 78, 710), radius=42, fill="#F97316")
    draw.text((center, 667), "タップ", font=font(29, True), fill="#FFFFFF", anchor="mm")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUTPUT, format="PNG", optimize=True)
print(OUTPUT)
