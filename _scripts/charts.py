"""Builds the inline SVG charts in _includes/charts/ for the blog posts.

Run:  python3 _scripts/charts.py
Colours and fonts come from post.css (classes m-a, m-b, m-ctx, grid, ...), so the
SVGs carry no hard-coded styling. Every number is copied from the project reports.
"""
from pathlib import Path
from html import escape
import math

OUT = Path(__file__).resolve().parents[1] / "_includes" / "charts"
W = 680


def svg(name, h, body, label):
    OUT.mkdir(parents=True, exist_ok=True)
    s = (f'<svg class="chart" viewBox="0 0 {W} {h}" role="img" aria-label="{escape(label)}" '
         f'xmlns="http://www.w3.org/2000/svg">\n{body}\n</svg>\n')
    (OUT / f"{name}.svg").write_text(s)


def text(x, y, s, cls="", anchor="start", extra=""):
    c = f' class="{cls}"' if cls else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{c}{extra}>{escape(s)}</text>'


def vbar(x, w, y0, y1, cls, r=3):
    """Vertical bar from baseline y0 to value y1, rounded only at the data end."""
    top, bot = min(y0, y1), max(y0, y1)
    h = bot - top
    r = min(r, w / 2, h)
    if y1 <= y0:   # grows up
        return (f'<path class="{cls}" d="M{x:.1f},{bot:.1f} V{top + r:.1f} Q{x:.1f},{top:.1f} {x + r:.1f},{top:.1f} '
                f'H{x + w - r:.1f} Q{x + w:.1f},{top:.1f} {x + w:.1f},{top + r:.1f} V{bot:.1f} Z"/>')
    return (f'<path class="{cls}" d="M{x:.1f},{top:.1f} V{bot - r:.1f} Q{x:.1f},{bot:.1f} {x + r:.1f},{bot:.1f} '
            f'H{x + w - r:.1f} Q{x + w:.1f},{bot:.1f} {x + w:.1f},{bot - r:.1f} V{top:.1f} Z"/>')


def hbar(x0, x1, y, h, cls, r=3, round_start=False):
    r = min(r, h / 2, (x1 - x0) / 2)
    if round_start:
        return f'<rect class="{cls}" x="{x0:.1f}" y="{y:.1f}" width="{x1 - x0:.1f}" height="{h:.1f}" rx="{r:.1f}"/>'
    return (f'<path class="{cls}" d="M{x0:.1f},{y:.1f} H{x1 - r:.1f} Q{x1:.1f},{y:.1f} {x1:.1f},{y + r:.1f} '
            f'V{y + h - r:.1f} Q{x1:.1f},{y + h:.1f} {x1 - r:.1f},{y + h:.1f} H{x0:.1f} Z"/>')


def mark(title, *parts, hit=None):
    h = f'<rect class="hit" x="{hit[0]:.1f}" y="{hit[1]:.1f}" width="{hit[2]:.1f}" height="{hit[3]:.1f}"/>' if hit else ""
    return f'<g class="mark"><title>{escape(title)}</title>{"".join(parts)}{h}</g>'


def legend(items, x, y):
    out, cx = [], x
    for cls, label in items:
        out.append(f'<rect class="{cls}" x="{cx:.1f}" y="{y - 9:.1f}" width="10" height="10" rx="2"/>')
        out.append(text(cx + 16, y, label, "t-ink"))
        cx += 16 + 7.2 * len(label) + 26
    return "".join(out)


def yaxis(L, R, y_of, ticks, fmt):
    out = []
    for t in ticks:
        y = y_of(t)
        out.append(f'<line class="grid" x1="{L}" x2="{R}" y1="{y:.1f}" y2="{y:.1f}"/>')
        out.append(text(L - 8, y + 4, fmt(t), anchor="end"))
    return "".join(out)


# ─────────────────────────── smolvlm2-act ───────────────────────────

def smol_identifiability():
    H, L, R, T, B = 300, 52, W - 12, 34, 248
    vals = [("LIBERO-Goal", "what I train on", 4.7, "m-a"),
            ("LIBERO-Spatial", "", 91.2, "m-ctx"),
            ("LIBERO-Object", "", 100.0, "m-ctx")]
    y_of = lambda v: B - (B - T) * v / 110
    body = [text(L, 14, "task named from the first frame, % of episodes", "t-title")]
    body.append(yaxis(L, R, y_of, [0, 25, 50, 75, 100], lambda t: f"{t}"))
    step = (R - L) / 3
    bw = 92
    for i, (name, sub, v, cls) in enumerate(vals):
        cx = L + step * (i + 0.5)
        body.append(mark(f"{name}: {v}%", vbar(cx - bw / 2, bw, B, y_of(v), cls),
                         text(cx, min(y_of(v), y_of(10)) - 8, f"{v:.1f}%", "t-ink", "middle"),
                         hit=(cx - step / 2, T, step, B - T)))
        body.append(text(cx, B + 20, name, "t-ink", "middle"))
        if sub:
            body.append(text(cx, B + 36, sub, "", "middle"))
    y10 = y_of(10)
    body.append(f'<line class="ref" x1="{L}" x2="{R}" y1="{y10:.1f}" y2="{y10:.1f}"/>')
    body.append(text(L + step, y10 - 6, "chance, 10%", "", "middle"))
    body.append(f'<line class="axis" x1="{L}" x2="{R}" y1="{B}" y2="{B}"/>')
    svg("smol-identifiability", H, "\n".join(body),
        "Bar chart. A nearest-neighbour probe on 24 by 24 thumbnails names the task from the first frame "
        "in 4.7% of LIBERO-Goal episodes (below the 10% chance line), 91.2% of LIBERO-Spatial and 100% of LIBERO-Object.")


def smol_window():
    H, L, R, T, B = 300, 52, W - 16, 34, 252
    offs = [0, 1, 2, 3, 4, 6, 8, 10, 16, 30, 80]
    vals = [7.6, 7.6, 9.9, 13.4, 19.8, 33.7, 51.2, 55.2, 76.2, 83.1, 96.4]
    f = lambda x: x / 10 if x <= 10 else 1 + math.log10(x / 10)   # symlog, linear below 10
    fmax = f(80)
    x_of = lambda x: L + (R - L) * f(x) / fmax
    y_of = lambda v: B - (B - T) * v / 105
    body = [text(L, 14, "task named from pixels, % of episodes", "t-title")]
    body.append(f'<rect class="band" x="{x_of(0):.1f}" y="{T}" width="{x_of(8) - x_of(0):.1f}" height="{B - T}"/>')
    body.append(text(x_of(0) + 10, T + 18, "first 8 frames:", "t-ink"))
    body.append(text(x_of(0) + 10, T + 34, "only the sentence", "t-ink"))
    body.append(text(x_of(0) + 10, T + 50, "says which task", "t-ink"))
    body.append(yaxis(L, R, y_of, [0, 25, 50, 75, 100], lambda t: f"{t}"))
    y10 = y_of(10)
    body.append(f'<line class="ref" x1="{L}" x2="{R}" y1="{y10:.1f}" y2="{y10:.1f}"/>')
    body.append(text(R, y10 - 6, "chance, 10%", "", "end"))
    pts = " ".join(f"{x_of(o):.1f},{y_of(v):.1f}" for o, v in zip(offs, vals))
    body.append(f'<polyline class="l-a" points="{pts}"/>')
    for o, v in zip(offs, vals):
        body.append(mark(f"frame {o}: {v}%", f'<circle class="dot-a" cx="{x_of(o):.1f}" cy="{y_of(v):.1f}" r="4.5"/>',
                         hit=(x_of(o) - 12, T, 24, B - T)))
    body.append(text(x_of(80) - 8, y_of(96.4) + 20, "96%", "t-ink", "end"))
    body.append(f'<line class="axis" x1="{L}" x2="{R}" y1="{B}" y2="{B}"/>')
    for t in [0, 2, 4, 8, 16, 30, 80]:
        body.append(text(x_of(t), B + 18, str(t), "", "middle"))
    body.append(text((L + R) / 2, B + 40, "frame within the episode (log scale past 10)", "", "middle"))
    svg("smol-window", H + 10, "\n".join(body),
        "Line chart. How often a pixel probe names the task, by frame within the episode: about 8% at frame 0, "
        "51% by frame 8, 76% by frame 16 and 96% by frame 80.")


def smol_modality():
    H, L, R, T, B = 330, 52, W - 12, 64, 262
    groups = [("Run 1", "uniform", 0.64, 0.099), ("Run 3b", "more scenes", 0.50, 0.012),
              ("Run 4", "all frames", 1.18, 0.45), ("Run 4", "first 8 frames", 0.88, 0.98)]
    y_of = lambda v: B - (B - T) * v / 1.35
    body = [text(L, 14, "loss increase when one input is corrupted, nats", "t-title")]
    body.append(legend([("m-a", "corrupt the camera images"), ("m-b", "corrupt the instruction")], L, 40))
    body.append(yaxis(L, R, y_of, [0, 0.25, 0.5, 0.75, 1.0, 1.25], lambda t: f"{t:g}"))
    step = (R - L) / 4
    bw = 40
    for i, (run, sub, a, b) in enumerate(groups):
        cx = L + step * (i + 0.5)
        xa, xb = cx - bw - 1, cx + 1
        body.append(mark(f"{run} ({sub}), images: {a}", vbar(xa, bw, B, y_of(a), "m-a"),
                         text(xa + bw / 2, y_of(a) - 7, f"{a:g}", "t-ink", "middle"),
                         hit=(xa - 4, T, bw + 5, B - T)))
        body.append(mark(f"{run} ({sub}), instruction: {b}", vbar(xb, bw, B, y_of(b), "m-b"),
                         text(xb + bw / 2, y_of(b) - 7, f"{b:g}", "t-ink", "middle"),
                         hit=(xb, T, bw + 5, B - T)))
        body.append(text(cx, B + 20, run, "t-ink", "middle"))
        body.append(text(cx, B + 36, sub, "", "middle"))
    body.append(f'<line class="axis" x1="{L}" x2="{R}" y1="{B}" y2="{B}"/>')
    svg("smol-modality", H + 6, "\n".join(body),
        "Grouped bar chart of the loss increase from corrupting the images versus the instruction. "
        "Run 1: 0.64 vs 0.099. Run 3b: 0.50 vs 0.012. Run 4, all frames: 1.18 vs 0.45. "
        "Run 4, first eight frames: 0.88 vs 0.98, the only case where the instruction matters more.")


# ─────────────────────────── glove-gap ───────────────────────────

def glove_detection():
    H, L, R, T = 250, 150, W - 40, 54
    rows = [("MediaPipe", [("synthetic gloves", 87, 90, "m-b"), ("real gloves", 94, 94, "m-a")]),
            ("WiLoR", [("synthetic gloves", 0, 4, "m-b"), ("real gloves", 35, 48, "m-a")])]
    x_of = lambda v: L + (R - L) * v / 100
    body = [text(0, 14, "drop in hands detected vs bare hands, percentage points", "t-title")]
    body.append(legend([("m-b", "synthetic gloves"), ("m-a", "real gloves")], 0, 40))
    for t in [0, 25, 50, 75, 100]:
        body.append(f'<line class="grid" x1="{x_of(t):.1f}" x2="{x_of(t):.1f}" y1="{T}" y2="{H - 34}"/>')
        body.append(text(x_of(t), H - 16, f"−{t}" if t else "0", "", "middle"))
    y, bh = T + 10, 22
    for model, series in rows:
        body.append(text(0, y + bh + 4, model, "t-ink"))
        for label, lo, hi, cls in series:
            parts = [hbar(x_of(0), x_of(max(lo, 0.6)), y, bh, cls)]
            if hi > lo:
                parts.append(f'<rect class="{cls}" x="{x_of(lo):.1f}" y="{y:.1f}" width="{x_of(hi) - x_of(lo):.1f}" '
                             f'height="{bh}" rx="3" opacity="0.4"/>')
            val = f"−{lo} to −{hi}" if hi > lo else f"−{hi}"
            parts.append(text(x_of(hi) + 8, y + bh - 6, val, "t-ink"))
            body.append(mark(f"{model}, {label}: {val} pp", *parts, hit=(L, y - 2, R - L, bh + 4)))
            y += bh + 6
        y += 18
    body.append(f'<line class="axis" x1="{x_of(0):.1f}" x2="{x_of(0):.1f}" y1="{T}" y2="{H - 34}"/>')
    svg("glove-detection", H, "\n".join(body),
        "Bar chart of the drop in hand detection compared with bare hands. MediaPipe: 87 to 90 points with "
        "synthetic gloves, 94 with real gloves. WiLoR: 0 to 4 points with synthetic gloves, 35 to 48 with real gloves.")


GLOVES = [("G0", "bare"), ("G1", "thin|nitrile"), ("G2", "grey|knit"),
          ("G3a", "dark|insulated"), ("G3b", "+4 px|outline"), ("G4", "bright|insulated")]


def glove_labels(cx, y, code, name):
    out = [text(cx, y, code, "t-ink", "middle")]
    for k, line in enumerate(name.split("|")):
        out.append(text(cx, y + 16 * (k + 1), line, "", "middle"))
    return "".join(out)


def glove_depth():
    H, L, R, T, B = 330, 52, W - 12, 40, 280
    vals = [4, 41, -28, -45, -124, -41]
    lo, hi = -140, 60
    y_of = lambda v: T + (B - T) * (hi - v) / (hi - lo)
    body = [text(L, 14, "single-camera wrist depth error, mm (below zero = hand placed too close)", "t-title")]
    body.append(yaxis(L, R, y_of, [-120, -80, -40, 0, 40], lambda t: f"{t:+d}" if t else "0"))
    step = (R - L) / 6
    bw = 50
    for i, ((code, name), v) in enumerate(zip(GLOVES, vals)):
        cx = L + step * (i + 0.5)
        cls = "m-ctx" if code == "G0" else "m-a"
        ty = y_of(v) - 8 if v > 0 else y_of(v) + 18
        body.append(mark(f"{code} {name.replace('|', ' ')}: {v:+d} mm", vbar(cx - bw / 2, bw, y_of(0), y_of(v), cls),
                         text(cx, ty, f"{v:+d}", "t-ink", "middle"),
                         hit=(cx - step / 2, T, step, B - T)))
        body.append(glove_labels(cx, B + 22, code, name))
    z = y_of(0)
    body.append(f'<line class="axis" x1="{L}" x2="{R}" y1="{z:.1f}" y2="{z:.1f}"/>')
    svg("glove-depth", H + 34, "\n".join(body),
        "Bar chart of single-camera wrist depth error by glove: bare +4 mm, thin nitrile +41, grey knit −28, "
        "dark insulated −45, dark insulated with a 4 pixel thicker outline −124, bright insulated −41.")


def glove_recovery():
    H, L, R, T = 262, 150, W - 60, 54
    rows = [("Hand position", [("2 calibrated views", 72, 88, "m-a"), ("thin nitrile glove", 67, 87, "m-b")]),
            ("Finger pose", [("2 calibrated views", 3, 49, "m-a"), ("thin nitrile glove", 73, 92, "m-b")])]
    x_of = lambda v: L + (R - L) * v / 100
    body = [text(0, 14, "share of the glove damage removed, %", "t-title")]
    body.append(legend([("m-a", "add a second calibrated camera"), ("m-b", "switch to a thin nitrile glove")], 0, 40))
    for t in [0, 25, 50, 75, 100]:
        body.append(f'<line class="grid" x1="{x_of(t):.1f}" x2="{x_of(t):.1f}" y1="{T}" y2="{H - 34}"/>')
        body.append(text(x_of(t), H - 16, f"{t}%", "", "middle"))
    y, bh = T + 10, 22
    for metric, series in rows:
        body.append(text(0, y + bh + 4, metric, "t-ink"))
        for label, lo, hi, cls in series:
            parts = [f'<rect class="{cls}" x="{x_of(lo):.1f}" y="{y:.1f}" width="{x_of(hi) - x_of(lo):.1f}" height="{bh}" rx="3"/>',
                     text(x_of(hi) + 8, y + bh - 6, f"{lo}–{hi}%", "t-ink")]
            body.append(mark(f"{metric}, {label}: {lo} to {hi}%", *parts, hit=(L, y - 2, R - L, bh + 4)))
            y += bh + 6
        y += 18
    svg("glove-recovery", H, "\n".join(body),
        "Range chart of how much of the glove-induced error each fix removes. Hand position: two calibrated views "
        "72 to 88%, thin nitrile glove 67 to 87%. Finger pose: two calibrated views only 3 to 49%, thin nitrile glove 73 to 92%.")


def glove_gate():
    H, L, R, T, B = 290, 52, W - 12, 34, 240
    vals = [95, 74, 37, 5, 0, 5]
    y_of = lambda v: B - (B - T) * v / 105
    body = [text(L, 14, "episodes passing the reprojection check, %", "t-title")]
    body.append(yaxis(L, R, y_of, [0, 25, 50, 75, 100], lambda t: f"{t}"))
    step = (R - L) / 6
    bw = 50
    for i, ((code, name), v) in enumerate(zip(GLOVES, vals)):
        cx = L + step * (i + 0.5)
        cls = "m-ctx" if code == "G0" else "m-a"
        bar = vbar(cx - bw / 2, bw, B, y_of(max(v, 0.8)), cls)
        body.append(mark(f"{code} {name.replace('|', ' ')}: {v}%", bar, text(cx, y_of(v) - 8, f"{v}%", "t-ink", "middle"),
                         hit=(cx - step / 2, T, step, B - T)))
        body.append(glove_labels(cx, B + 22, code, name))
    body.append(f'<line class="axis" x1="{L}" x2="{R}" y1="{B}" y2="{B}"/>')
    svg("glove-gate", H + 26, "\n".join(body),
        "Bar chart of episodes passing a two-view reprojection check: bare 95%, thin nitrile 74%, grey knit 37%, "
        "dark insulated 5%, thicker outline 0%, bright insulated 5%.")


if __name__ == "__main__":
    for fn in [smol_identifiability, smol_window, smol_modality,
               glove_detection, glove_depth, glove_recovery, glove_gate]:
        fn()
    print("wrote", sorted(p.name for p in OUT.glob("*.svg")))
