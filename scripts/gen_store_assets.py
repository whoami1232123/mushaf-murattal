"""
One-off generator for Google Play store listing graphics, built from the
app's actual brand colors (css/style.css :root) and real icon — not a mockup.
Run: python scripts/gen_store_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "store", "graphics")
os.makedirs(OUT, exist_ok=True)

BG = (247, 243, 234)        # --bg
ACCENT = (15, 109, 92)      # --accent
ACCENT_DARK = (10, 79, 66)  # --accent-dark
INK = (43, 36, 23)          # --ink
WHITE = (255, 255, 255)

FONT_BOLD = r"C:\Windows\Fonts\tahomabd.ttf"
FONT_REG = r"C:\Windows\Fonts\tahoma.ttf"


def ar(text):
    """Shape + reorder Arabic text so PIL draws it correctly (RTL, joined letters)."""
    return get_display(arabic_reshaper.reshape(text))


def feature_graphic():
    """1024x500 banner shown at the top of the Play Store listing."""
    W, H = 1024, 500
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Diagonal accent band, echoing the app's teal.
    draw.polygon([(0, H), (W * 0.42, H), (W * 0.62, 0), (0, 0)], fill=ACCENT_DARK)
    draw.polygon([(0, H), (W * 0.34, H), (W * 0.54, 0), (0, 0)], fill=ACCENT)

    icon = Image.open(os.path.join(ROOT, "icons", "icon-512.png")).convert("RGBA")
    icon = icon.resize((300, 300), Image.LANCZOS)
    img.paste(icon, (60, (H - 300) // 2), icon)

    title_font = ImageFont.truetype(FONT_BOLD, 64)
    tag_font = ImageFont.truetype(FONT_REG, 30)

    title = ar("المصحف المرتل")
    tw = draw.textlength(title, font=title_font)
    draw.text((W - 60 - tw, 165), title, font=title_font, fill=INK)

    tagline = ar("تلاوة، تجويد، وحفظ القرآن الكريم")
    tgw = draw.textlength(tagline, font=tag_font)
    draw.text((W - 60 - tgw, 250), tagline, font=tag_font, fill=ACCENT_DARK)

    path = os.path.join(OUT, "feature-graphic-1024x500.png")
    img.save(path)
    print("wrote", path)


def hires_icon():
    """512x512 Play Store listing icon — just the app icon, no changes needed,
    but copied here so every store asset lives in one folder."""
    src = os.path.join(ROOT, "icons", "icon-512.png")
    dst = os.path.join(OUT, "app-icon-512x512.png")
    Image.open(src).convert("RGBA").save(dst)
    print("wrote", dst)


if __name__ == "__main__":
    feature_graphic()
    hires_icon()
