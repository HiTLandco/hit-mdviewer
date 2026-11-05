"""Builds media/icon.png from the HiT logo master: keeps only the kite, drops the shadow and noisy edges.
Run: python scripts/make_icon.py <path to the logo master png>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

MASTER = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "media" / "icon.png"
KITE = [(145, 42), (640, 42), (908, 463), (147, 950)]  # corners in the 1024 px master
SIZE = 256
PAD = 16
SS = 4  # supersampling for a clean edge

logo = Image.open(MASTER).convert("RGB")
mask = Image.new("L", logo.size, 0)
ImageDraw.Draw(mask).polygon(KITE, fill=255)
kite = Image.new("RGBA", logo.size, (0, 0, 0, 0))
kite.paste(logo, (0, 0), mask)
kite = kite.crop(mask.getbbox())

scale = (SIZE - 2 * PAD) / max(kite.size)
fitted = kite.resize((round(kite.width * scale), round(kite.height * scale)), Image.LANCZOS)
icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
icon.alpha_composite(fitted, ((SIZE - fitted.width) // 2, (SIZE - fitted.height) // 2))
OUT.parent.mkdir(parents=True, exist_ok=True)
icon.save(OUT)
print(OUT)
