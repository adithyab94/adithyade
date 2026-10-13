"""Turn a folder of film scans into an Offline roll.

    python3 _scripts/add_roll.py ~/Downloads/scans/roll-03 "Roll 03" --camera "Olympus OM-1" --film "Portra 400"

Writes assets/offline/<slug>/frame-NN.jpg (2400 px long edge) and frame-NN-thumb.jpg (480 px),
in file-name order, and creates _offline/<slug>.md for you to fill in. Scans can be JPG, PNG or TIFF.
"""
import argparse, datetime, pathlib, re

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def save(img, path, edge, quality):
    im = img.copy()
    im.thumbnail((edge, edge), Image.LANCZOS)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scans", type=pathlib.Path)
    ap.add_argument("title")
    ap.add_argument("--camera", default="")
    ap.add_argument("--film", default="")
    ap.add_argument("--place", default="")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    a = ap.parse_args()

    files = sorted(p for p in a.scans.iterdir() if p.suffix.lower() in EXTS)
    if not files:
        raise SystemExit(f"no scans found in {a.scans}")
    slug = slugify(a.title)
    out = ROOT / "assets/offline" / slug
    out.mkdir(parents=True, exist_ok=True)

    for i, f in enumerate(files, 1):
        img = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        save(img, out / f"frame-{i:02d}.jpg", 2400, 85)
        save(img, out / f"frame-{i:02d}-thumb.jpg", 480, 80)
        print(f"  {f.name} -> frame-{i:02d}.jpg")

    md = ROOT / "_offline" / f"{slug}.md"
    if not md.exists():
        md.write_text(f'''---
title: "{a.title}"
kind: roll
date: {a.date}
folder: {slug}
camera: "{a.camera}"
film: "{a.film}"
place: "{a.place}"
# Optional captions, by file name:
# captions:
#   frame-01: "The lake, before the rain"
---

A few lines about this roll: where you were, what you were looking for.
''')
        print(f"wrote {md.relative_to(ROOT)}")
    print(f"{len(files)} frames in {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
