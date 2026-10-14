"""Turn a cut-out PNG (transparent background) into a home-page sticker.

    python3 _scripts/make_sticker.py cutout.png assets/stickers/name.webp

Adds a light warm grade, film grain, a thin white die-cut edge and a soft shadow.
"""
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def sticker(im, long_edge=720, border=10, seed=3):
    rng = np.random.default_rng(seed)
    im = im.convert("RGBA")
    im = im.crop(im.getbbox())
    im.thumbnail((long_edge - 2 * border, long_edge - 2 * border), Image.LANCZOS)
    rgb, alpha = im.convert("RGB"), im.getchannel("A")
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(rgb).enhance(0.85)).enhance(0.95)
    arr = np.asarray(rgb).astype(float) * np.array([1.03, 1.0, 0.93]) + np.array([6, 4, 0])
    arr += rng.normal(0, 11, arr.shape[:2])[..., None]                       # film grain
    rgb = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    pad = border + 18
    W, H = im.size
    canvas = Image.new("RGBA", (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    a = Image.new("L", canvas.size, 0)
    a.paste(alpha, (pad, pad))
    edge = a.filter(ImageFilter.MaxFilter(2 * border + 1))                  # die-cut outline
    shadow = Image.new("RGBA", canvas.size, (35, 34, 32, 0))
    shadow.putalpha(edge.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.22)))
    canvas.alpha_composite(shadow, (4, 8))
    white = Image.new("RGBA", canvas.size, (253, 252, 247, 0))
    white.putalpha(edge)
    canvas.alpha_composite(white)
    obj = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    obj.paste(rgb, (pad, pad))
    obj.putalpha(a)
    canvas.alpha_composite(obj)
    return canvas


if __name__ == "__main__":
    sticker(Image.open(sys.argv[1])).save(sys.argv[2], "WEBP", quality=84, method=6)
