#!/usr/bin/env python3
"""
reMarkable Paper Pro "Methods" templates for the UX sketching set.
Confirmed capabilities (probed on-device):
  - path items with M/L/Z data render; strokeWidth strokes render
  - fillColor (hex) fills closed paths, full grayscale (black/white/gray)
  - a path with two subpaths leaves an even-odd hole  -> screen cutout
  - curve commands (C/A) BREAK rendering -> rounded corners via straight segments
No on-canvas text. Page = rmPP 2160 x 2880, absolute pixel coordinates.
"""
import json, time, os, math, glob, zipfile
import gen_templates as g   # reuse device specs + layout math
import make_icons as mi     # 150x200 iconData thumbnails

PAGE_W, PAGE_H = g.PAGE_W, g.PAGE_H

# grayscale palette (tune on device)
SUPPORTED_SCREENS = ["rmPP"]   # which devices the templates appear on
BLACK   = "#000000"
COL     = "#DCDCDC"   # 12-column shading
UNSAFE  = "#ECECEC"   # unsafe-area tint
# grid + notes are single STROKED lines now (not filled boxes) -> crisp, fine, dark.
# stroke colour can't be set on-device (renders dark), which is what we want here.
GRID_STROKE = 1.2     # in-device grid line width (canvas px)
NOTE_STROKE = 1.3     # note ruling line width
SEG     = 8           # segments per rounded corner

# ---------------- geometry helpers ----------------
def tfm(lx, ly, s, tx, ty, rot):
    if rot == 0:
        return (tx + s*lx, ty + s*ly)
    return (tx - s*ly, ty + s*lx)          # translate(tx,ty) scale(s) rotate(90)

def rounded_pts(x, y, w, h, r, seg=SEG):
    r = min(r, w/2, h/2)
    cs = [(x+w-r, y+r, -math.pi/2, 0.0),    # TR
          (x+w-r, y+h-r, 0.0, math.pi/2),   # BR
          (x+r,   y+h-r, math.pi/2, math.pi),     # BL
          (x+r,   y+r, math.pi, 3*math.pi/2)]     # TL
    pts = []
    for cx, cy, a0, a1 in cs:
        for k in range(seg+1):
            a = a0 + (a1-a0)*k/seg
            pts.append((cx + r*math.cos(a), cy + r*math.sin(a)))
    return pts

def rect_pts(x, y, w, h):
    return [(x, y), (x+w, y), (x+w, y+h), (x, y+h)]

def xfpts(pts, s, tx, ty, rot):
    return [tfm(px, py, s, tx, ty, rot) for (px, py) in pts]

# Coordinates are emitted as expressions scaled to the device's page canvas, so
# the template fits exactly regardless of the actual templateWidth/Height.
# Design space is 2160x2880; sx = templateWidth/2160, sy = templateHeight/2880.
def xexpr(v): return f"{round(v)} * sx"
def yexpr(v): return f"{round(v)} * sy"

def data_from(pts):
    d = ["M", xexpr(pts[0][0]), yexpr(pts[0][1])]
    for px, py in pts[1:]:
        d += ["L", xexpr(px), yexpr(py)]
    d.append("Z")
    return d

_id = 0
def nid():
    global _id; _id += 1; return f"i{_id}"

def fill_item(pts, color):
    return {"id": nid(), "type": "path", "fillColor": color, "data": data_from(pts)}

def ring_item(outer, inner, color):
    return {"id": nid(), "type": "path", "fillColor": color,
            "data": data_from(outer) + data_from(inner)}

def stroke_line(p1, p2, width):
    return {"id": nid(), "type": "path", "strokeWidth": width,
            "data": ["M", xexpr(p1[0]), yexpr(p1[1]), "L", xexpr(p2[0]), yexpr(p2[1])]}

def circle_pts(cx, cy, r, n=14):
    return [(cx + r*math.cos(2*math.pi*k/n), cy + r*math.sin(2*math.pi*k/n)) for k in range(n)]

# ---------------- device drawing -> items ----------------
def device_items(spec, s, tx, ty, rot, variant, local_overlays):
    items = []
    bx, by, bw, bh, brx = spec["body"]
    scx, scy, scw, sch, srx = spec["screen"]
    ins = spec["inset"]
    safe = (scx+ins["left"], scy+ins["top"], scw-ins["left"]-ins["right"], sch-ins["top"]-ins["bottom"])

    # ---- overlays first (under the black frame) ----
    if local_overlays:
        sx, sy, sw, sh = safe
        if variant in ("col", "colgrid"):
            n = 12; pitch = sw/n; gut = 0.22*pitch; cw = pitch-gut
            for i in range(n):
                r = (sx + i*pitch + gut/2, sy, cw, sh)
                items.append(fill_item(xfpts(rect_pts(*r), s, tx, ty, rot), COL))
        if variant in ("grid", "colgrid"):
            cell = sw/12
            x = sx
            while x <= sx+sw+0.5:
                items.append(stroke_line(tfm(x, sy, s, tx, ty, rot), tfm(x, sy+sh, s, tx, ty, rot), GRID_STROKE)); x += cell
            yy = sy
            while yy <= sy+sh+0.5:
                items.append(stroke_line(tfm(sx, yy, s, tx, ty, rot), tfm(sx+sw, yy, s, tx, ty, rot), GRID_STROKE)); yy += cell
    # unsafe tint (always local; rotates with hardware)
    items.append(fill_item(xfpts(rect_pts(scx, scy, scw, ins["top"]), s, tx, ty, rot), UNSAFE))
    items.append(fill_item(xfpts(rect_pts(scx, scy+sch-ins["bottom"], scw, ins["bottom"]), s, tx, ty, rot), UNSAFE))

    # ---- black bezel (body minus screen, even-odd hole) ----
    outer = xfpts(rounded_pts(bx, by, bw, bh, brx), s, tx, ty, rot)
    inner = xfpts(rounded_pts(scx, scy, scw, sch, srx), s, tx, ty, rot)
    items.append(ring_item(outer, inner, BLACK))

    # ---- hardware, solid black ----
    if spec["island"]:
        x, y, w, h, r = spec["island"]
        items.append(fill_item(xfpts(rounded_pts(x, y, w, h, r), s, tx, ty, rot), BLACK))
    if spec["cam"]:
        cx, cy, r = spec["cam"]
        items.append(fill_item(xfpts(circle_pts(cx, cy, r), s, tx, ty, rot), BLACK))
    if spec["pill"]:
        x, y, w, h, r = spec["pill"]
        items.append(fill_item(xfpts(rounded_pts(x, y, w, h, r), s, tx, ty, rot), BLACK))
    for (xx, yy, ww, hh) in spec["buttons"]:
        items.append(fill_item(xfpts(rect_pts(xx, yy, ww, hh), s, tx, ty, rot), BLACK))
    return items

def page_space_overlays(spec, s, tx, ty, rot, variant):
    """one_land2: screen content stays page-oriented (vertical columns)."""
    items = []
    sx, sy, sw, sh, sr = g.screen_page_rect(spec, s, tx, ty, rot)
    ins = spec["inset"]
    li = s*ins["bottom"]; ri = s*ins["top"]
    fx, fy, fw, fh = sx+li, sy, sw-li-ri, sh
    if variant in ("col", "colgrid"):
        n = 12; pitch = fw/n; gut = 0.22*pitch; cw = pitch-gut
        for i in range(n):
            items.append(fill_item(rect_pts(fx+i*pitch+gut/2, fy, cw, fh), COL))
    if variant in ("grid", "colgrid"):
        cell = fw/12
        x = fx
        while x <= fx+fw+0.5:
            items.append(stroke_line((x, fy), (x, fy+fh), GRID_STROKE)); x += cell
        yy = fy
        while yy <= fy+fh+0.5:
            items.append(stroke_line((fx, yy), (fx+fw, yy), GRID_STROKE)); yy += cell
    return items

def note_items(note):
    items = []
    x, y, w, h = note["x"], note["y"], note["w"], note["h"]
    if not note["vertical"]:
        yy = y + 78
        while yy <= y+h+0.5:
            items.append(stroke_line((x, yy), (x+w, yy), NOTE_STROKE)); yy += 78
    else:
        xx = x + 78
        while xx <= x+w+0.5:
            items.append(stroke_line((xx, y), (xx, y+h), NOTE_STROKE)); xx += 78
    return items

def build_items(spec, layout, variant):
    dev_boxes, note = g.layout_boxes(layout)
    page_grid = layout in g.PAGE_GRID_LAYOUTS
    items = []
    for (bx, by, bw, bh, orient) in dev_boxes:
        if orient == "P":
            s, tx, ty, rot = g.fit_portrait(spec, bx, by, bw, bh)
        else:
            s, tx, ty, rot = g.fit_landscape(spec, bx, by, bw, bh)
        if page_grid:
            items += page_space_overlays(spec, s, tx, ty, rot, variant)
            items += device_items(spec, s, tx, ty, rot, variant, local_overlays=False)
        else:
            items += device_items(spec, s, tx, ty, rot, variant, local_overlays=True)
    items += note_items(note)
    return items

# ---------------- file emission ----------------
DEVNAME = {"android": "Android", "iphone": "iPhone"}   # NOTE: no "16"
LEAF    = {"android": "Android", "iphone": "iPhone"}
COUNT   = {"one": "1UP", "two": "2UP", "four": "4UP",
           "one_land": "1UP", "one_land2": "1UP", "four_land": "4UP"}
LS_PAGE = {"one_land", "four_land"}      # landscape PAGE/notes layout  -> "LS"
WIDE_DEV = {"one_land2"}                 # landscape PHONE on a portrait page -> "WIDE"

def short_name(dev, layout, variant):
    t = [COUNT[layout]]
    if layout in LS_PAGE:  t.append("LS")
    if layout in WIDE_DEV: t.append("WIDE")
    if variant in ("col", "colgrid"): t.append("COL")
    if variant in ("grid", "colgrid"): t.append("GRD")
    t.append("iPhone" if dev == "iphone" else "Android")
    return " ".join(t)

def write_template(outdir, base, dev, layout, variant):
    global _id; _id = 0
    name = short_name(dev, layout, variant)
    items = build_items(g.ANDROID if dev == "android" else g.IPHONE, layout, variant)
    now = int(time.time()*1000)
    open(os.path.join(outdir, base+".content"), "w").write("{}")
    json.dump({"createdTime": str(now), "lastModified": str(now+1), "parent": "",
               "pinned": False, "type": "TemplateType", "visibleName": name,
               "source": "org.dreadnode.ux", "new": True},
              open(os.path.join(outdir, base+".metadata"), "w"), indent=2)
    json.dump({"name": name, "author": "Thomas", "templateVersion": "1.0.0",
               "formatVersion": 1, "iconData": mi.icon_b64(dev, layout, variant),
               "categories": ["UX Templates", "Mobile Templates", LEAF[dev]],
               "labels": [DEVNAME[dev], layout, variant], "orientation": "portrait",
               "supportedScreens": SUPPORTED_SCREENS,
               "constants": [{"sx": "templateWidth / 2160"}, {"sy": "templateHeight / 2880"}],
               "items": items},
              open(os.path.join(outdir, base+".template"), "w"), indent=2)
    return name, items

def all_specs():
    for dev, _ in g.DEVICES:
        for lay in g.LAYOUTS:
            for var in g.VARIANTS:
                yield dev, lay, var

if __name__ == "__main__":
    PREFIX = "uxtpl_"          # namespaced so you can find/delete just these
    outdir = "methods_out"
    os.makedirs(outdir, exist_ok=True)
    for f in glob.glob(outdir+"/*"):
        try: os.remove(f)
        except OSError: pass
    rows = []
    for dev, lay, var in all_specs():
        base = f"{PREFIX}{dev}_{lay}_{var}"
        name, _ = write_template(outdir, base, dev, lay, var)
        rows.append((name, base))
    for p in glob.glob(outdir+"/*.template")+glob.glob(outdir+"/*.metadata"):
        json.load(open(p))
    with open(os.path.join(outdir, "MANIFEST.txt"), "w") as f:
        for name, base in sorted(rows):
            f.write(f"{name:26s}  {base}\n")
    print(f"wrote {len(rows)} templates ({len(rows)*3} files) to {outdir}/  -- all JSON valid")
