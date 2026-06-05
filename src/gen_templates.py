#!/usr/bin/env python3
"""
UX sketching notebook templates (SVG geometry + layout math).
Page = reMarkable Paper Pro design space 2160 x 2880, portrait.
This module is imported by gen_methods.py (the Methods-format emitter).
Devices: Samsung Galaxy A-series (Android) and iPhone 16.
Layouts: one, two, four (portrait) + one_land, one_land2, four_land.
Variants: col (12-column shading) / colgrid (+ grid) / grid only.
"""
import os, math

PAGE_W, PAGE_H = 2160, 2880
M = 130  # outer page margin

# Page-title write-in rule: a blank underline near the top-left to hand-write a page title.
# HEADER reserves a top band for it; device boxes + notes shift down by HEADER so nothing
# overlaps (the bottom note area absorbs the space).
HEADER  = 120   # top band reserved for the title rule
TITLE_Y = 196   # baseline (y) of the title underline
TITLE_W = 1150  # underline length (~30 handwritten chars)

# ---- SVG styling (used by the SVG proxy renderer / preview) ----
C_BLACK = "#000000"; PAPER = "#ffffff"
UNSAFE = "#000000"; UNSAFE_OP = 0.07
COL_FILL = "#000000"; COL_OP = 0.065
GRID_COL = "#000000"; GRID_OP = 0.075
NOTE_COL = "#000000"; NOTE_OP = 0.16
W_GRID = 1.4; W_NOTE = 1.6

# ---- device specs (local viewBox units) ----
ANDROID = dict(
    vb=(392, 832),
    body=(4, 4, 384, 824, 46),
    inner=(10, 10, 372, 812, 40),
    screen=(16, 16, 360, 800, 24),
    inset=dict(top=32, bottom=24, left=0, right=0),
    cam=(196, 27, 5),
    pill=(142, 803, 108, 4, 2),
    island=None,
    buttons=[(388, 180, 3, 44), (388, 230, 3, 44), (388, 296, 3, 62)],
)
IPHONE = dict(
    vb=(425, 884),
    body=(2, 2, 421, 880, 72),
    inner=(9, 9, 407, 866, 66),
    screen=(16, 16, 393, 852, 55),
    inset=dict(top=59, bottom=34, left=0, right=0),
    cam=None,
    pill=(143, 855, 139, 5, 2.5),
    island=(150, 27, 125, 37, 18.5),
    buttons=[(0, 150, 3, 30), (0, 212, 3, 52), (0, 276, 3, 52), (422, 230, 3, 86)],
)

_uid = 0
def uid():
    global _uid; _uid += 1; return f"c{_uid}"

def rr(x, y, w, h, r, **attrs):
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    return f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{r:.2f}" ry="{r:.2f}" {a}/>'

def line(x1, y1, x2, y2, **attrs):
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    return f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" {a}/>'

def columns_local(safe, n=12, gutter_frac=0.22):
    sx, sy, sw, sh = safe
    pitch = sw / n; g = gutter_frac * pitch; cw = pitch - g
    return "".join(rr(sx + i*pitch + g/2, sy, cw, sh, 0, fill=COL_FILL, fill_opacity=COL_OP) for i in range(n))

def grid_local(safe, sw_stroke, n_across=12):
    sx, sy, sw, sh = safe
    cell = sw / n_across
    out = [f'<g stroke="{GRID_COL}" stroke-opacity="{GRID_OP}" stroke-width="{W_GRID*sw_stroke:.3f}">']
    x = sx
    while x <= sx + sw + 0.5:
        out.append(line(x, sy, x, sy + sh)); x += cell
    y = sy
    while y <= sy + sh + 0.5:
        out.append(line(sx, y, sx + sw, y)); y += cell
    out.append('</g>'); return "".join(out)

def screen_page_rect(spec, s, tx, ty, rot):
    scx, scy, scw, sch, srx = spec["screen"]
    if rot == 0:
        return (tx + s*scx, ty + s*scy, s*scw, s*sch, s*srx)
    return (tx - s*(scy+sch), ty + s*scx, s*sch, s*scw, s*srx)

def overlays_page_space(spec, s, tx, ty, rot, variant):
    sx, sy, sw, sh, sr = screen_page_rect(spec, s, tx, ty, rot)
    ins = spec["inset"]
    li = s*ins["bottom"]; ri = s*ins["top"]
    safe = (sx + li, sy, sw - li - ri, sh)
    cid = uid()
    out = [f'<clipPath id="{cid}">{rr(sx,sy,sw,sh,sr)}</clipPath>', f'<g clip-path="url(#{cid})">']
    if variant in ("col", "colgrid"): out.append(columns_local(safe))
    if variant in ("grid", "colgrid"): out.append(grid_local(safe, 1.0))
    out.append('</g>'); return "".join(out)

def draw_device(spec, s, tx, ty, rot, variant, local_overlays=True):
    sw = 1.0 / s
    bx, by, bw, bh, brx = spec["body"]
    scx, scy, scw, sch, srx = spec["screen"]
    ins = spec["inset"]
    safe = (scx+ins["left"], scy+ins["top"], scw-ins["left"]-ins["right"], sch-ins["top"]-ins["bottom"])
    cid = uid(); g = []
    g.append(rr(bx, by, bw, bh, brx, fill=C_BLACK))
    g.append(rr(scx, scy, scw, sch, srx, fill=PAPER))
    g.append(f'<clipPath id="{cid}">{rr(scx,scy,scw,sch,srx)}</clipPath>')
    ov = []
    if local_overlays and variant in ("col", "colgrid"): ov.append(columns_local(safe))
    if local_overlays and variant in ("grid", "colgrid"): ov.append(grid_local(safe, sw))
    ov.append(rr(scx, scy, scw, ins["top"], 0, fill=UNSAFE, fill_opacity=UNSAFE_OP))
    ov.append(rr(scx, scy+sch-ins["bottom"], scw, ins["bottom"], 0, fill=UNSAFE, fill_opacity=UNSAFE_OP))
    g.append(f'<g clip-path="url(#{cid})">' + "".join(ov) + '</g>')
    if spec["island"]:
        x, y, w, h, r = spec["island"]; g.append(rr(x, y, w, h, r, fill=C_BLACK))
    if spec["cam"]:
        cx, cy, r = spec["cam"]; g.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{C_BLACK}"/>')
    if spec["pill"]:
        x, y, w, h, r = spec["pill"]; g.append(rr(x, y, w, h, r, fill=C_BLACK))
    for (xx, yy, ww, hh) in spec["buttons"]:
        g.append(rr(xx, yy, ww, hh, ww/2, fill=C_BLACK))
    tf = f'translate({tx:.2f},{ty:.2f}) scale({s:.5f})'
    if rot != 0: tf += ' rotate(90)'
    return f'<g transform="{tf}">' + "".join(g) + '</g>'

def note_lines(x, y, w, h, vertical=False, spacing=78):
    out = [f'<g stroke="{NOTE_COL}" stroke-opacity="{NOTE_OP}" stroke-width="{W_NOTE}">']
    if not vertical:
        yy = y + spacing
        while yy <= y + h + 0.5:
            out.append(line(x, yy, x + w, yy)); yy += spacing
    else:
        xx = x + spacing
        while xx <= x + w + 0.5:
            out.append(line(xx, y, xx, y + h)); xx += spacing
    out.append('</g>'); return "".join(out)

def fit_portrait(spec, bx, by, bw, bh):
    vw, vh = spec["vb"]
    s = min(bw / vw, bh / vh)
    return s, bx + (bw - s*vw)/2, by + (bh - s*vh)/2, 0

def fit_landscape(spec, bx, by, bw, bh):
    vw, vh = spec["vb"]
    s = min(bw / vh, bh / vw)
    return s, bx + (bw + s*vh)/2, by + (bh - s*vw)/2, 90

def layout_boxes(layout):
    cw = PAGE_W - 2*M
    if layout == "one":
        dev = [(M, 150, cw, 1930, "P")]
        note = dict(x=M, y=2140, w=cw, h=PAGE_H-2140-90, vertical=False)
    elif layout == "two":
        gap = 80; bw = (cw - gap)/2
        dev = [(M, 150, bw, 1930, "P"), (M+bw+gap, 150, bw, 1930, "P")]
        note = dict(x=M, y=2140, w=cw, h=PAGE_H-2140-90, vertical=False)
    elif layout == "four":
        gap = 46; bw = (cw - 3*gap)/4
        dev = [(M + i*(bw+gap), 165, bw, 980, "P") for i in range(4)]
        note = dict(x=M, y=1210, w=cw, h=PAGE_H-1210-90, vertical=False)
    elif layout == "one_land":
        dev = [(M, 165, cw, 980, "L")]
        note = dict(x=M, y=1210, w=cw, h=PAGE_H-1210-90, vertical=True)
    elif layout == "one_land2":
        dev = [(M, 165, cw, 980, "L")]
        note = dict(x=M, y=1210, w=cw, h=PAGE_H-1210-90, vertical=False)
    elif layout == "four_land":
        gap = 70; bw = (cw - gap)/2; bh = 470; vgap = 55
        dev = []
        for r in range(2):
            for c in range(2):
                dev.append((M + c*(bw+gap), 175 + r*(bh+vgap), bw, bh, "L"))
        ny = 175 + 2*bh + vgap + 70
        note = dict(x=M, y=ny, w=cw, h=PAGE_H-ny-90, vertical=True)
    else:
        raise ValueError(layout)
    # Shift everything down by HEADER to clear the top title band; the bottom note
    # area absorbs the space (device sizes unchanged).
    dev = [(bx, by + HEADER, bw, bh, o) for (bx, by, bw, bh, o) in dev]
    note = dict(note, y=note["y"] + HEADER, h=note["h"] - HEADER)
    return dev, note

def build_page(device_spec, layout, variant):
    dev_boxes, note = layout_boxes(layout)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}" height="{PAGE_H}" viewBox="0 0 {PAGE_W} {PAGE_H}">',
             f'<rect x="0" y="0" width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>']
    page_grid = layout in PAGE_GRID_LAYOUTS
    for (bx, by, bw, bh, orient) in dev_boxes:
        if orient == "P":
            s, tx, ty, rot = fit_portrait(device_spec, bx, by, bw, bh)
        else:
            s, tx, ty, rot = fit_landscape(device_spec, bx, by, bw, bh)
        parts.append(draw_device(device_spec, s, tx, ty, rot, variant, local_overlays=not page_grid))
        if page_grid:
            parts.append(overlays_page_space(device_spec, s, tx, ty, rot, variant))
    parts.append(f'<g stroke="{NOTE_COL}" stroke-opacity="{NOTE_OP}" stroke-width="{W_NOTE}">'
                 + line(M, TITLE_Y, M + TITLE_W, TITLE_Y) + '</g>')
    parts.append(note_lines(note["x"], note["y"], note["w"], note["h"], vertical=note["vertical"]))
    parts.append("</svg>"); return "".join(parts)

DEVICES = [("android", ANDROID), ("iphone", IPHONE)]
LAYOUTS = ["one", "two", "four", "one_land", "one_land2", "four_land"]
VARIANTS = ["col", "colgrid", "grid"]
PAGE_GRID_LAYOUTS = {"one_land2"}

LAYOUT_NAME = {"one":"One Up","two":"Two Up","four":"Four Up",
               "one_land":"One Up Landscape (Vertical Notes)",
               "one_land2":"One Up Landscape (Horizontal Notes)",
               "four_land":"Four Up Landscape"}
VARIANT_NAME = {"col":"12 Column","colgrid":"12 Column + Grid","grid":"Grid"}
DEVICE_NAME = {"android":"Android","iphone":"iPhone 16"}

if __name__ == "__main__":
    outdir = os.path.join(os.path.dirname(__file__) or ".", "pages")
    os.makedirs(outdir, exist_ok=True)
    n = 0
    for dkey, dspec in DEVICES:
        for lay in LAYOUTS:
            for var in VARIANTS:
                open(os.path.join(outdir, f"{dkey}_{lay}_{var}.svg"), "w").write(build_page(dspec, lay, var)); n += 1
    print("wrote", n, "SVG pages to", outdir)
