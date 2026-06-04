#!/usr/bin/env python3
"""150x200 SVG thumbnails (iconData) for the Methods templates.
Layout: the device screens (constant small size) up top, then the platform logo
and a content swatch side-by-side underneath. Notes fields omitted."""
import base64

DARK = "#1a1a1a"; GRAY = "#9a9a9a"; LGRAY = "#c8c8c8"; SW = "#7a7a7a"

# constant screen size (the old "four up" size), kept the same in every layout
PW, PH = 27, 57          # portrait phone body
LW, LH = 57, 27          # landscape phone body
DEV_CY = 60              # vertical center of the screen-arrangement area

def apple(cx, cy):
    s = 1.7
    body = ("M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79"
            "-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39"
            "c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91"
            ".65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04"
            "-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35"
            "-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z")
    return (f'<g transform="translate({cx-12.5*s:.1f},{cy-12*s:.1f}) scale({s})" fill="{DARK}">'
            f'<path d="{body}"/></g>')

def android(cx, cy):
    hw, hh = 36, 21
    x0 = cx - hw/2
    base = cy + hh/2          # flat bottom of the head
    mid = base - 6            # where the straight sides meet the dome
    top = mid - hw/2          # peak
    out = [f'<g>']
    # antennae (clearly sticking up & out)
    out.append(f'<line x1="{cx-8:.1f}" y1="{top+5:.1f}" x2="{cx-15:.1f}" y2="{top-7:.1f}" '
               f'stroke="{DARK}" stroke-width="2.6" stroke-linecap="round"/>')
    out.append(f'<line x1="{cx+8:.1f}" y1="{top+5:.1f}" x2="{cx+15:.1f}" y2="{top-7:.1f}" '
               f'stroke="{DARK}" stroke-width="2.6" stroke-linecap="round"/>')
    # head: straight sides + semicircle dome on top
    out.append(f'<path d="M{x0:.1f} {base:.1f} L{x0:.1f} {mid:.1f} '
               f'A{hw/2:.1f} {hw/2:.1f} 0 0 1 {x0+hw:.1f} {mid:.1f} L{x0+hw:.1f} {base:.1f} Z" fill="{DARK}"/>')
    # eyes
    out.append(f'<circle cx="{cx-7:.1f}" cy="{base-7:.1f}" r="2.1" fill="#fff"/>')
    out.append(f'<circle cx="{cx+7:.1f}" cy="{base-7:.1f}" r="2.1" fill="#fff"/>')
    out.append('</g>')
    return "".join(out)

def phone(cx, cy, bw, bh, device):
    x, y = cx-bw/2, cy-bh/2
    r = max(2, min(bw, bh)*0.16)
    m = max(1.3, min(bw, bh)*0.07)
    sx, sy, sw, sh = x+m, y+m, bw-2*m, bh-2*m
    sr = max(1, r-m)
    out = [f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="{r:.1f}" fill="{DARK}"/>',
           f'<rect x="{sx:.1f}" y="{sy:.1f}" width="{sw:.1f}" height="{sh:.1f}" rx="{sr:.1f}" fill="#fff"/>']
    land = bw > bh
    if device == "iphone":
        if not land:
            pw, ph = sw*0.36, 1.8
            out.append(f'<rect x="{cx-pw/2:.1f}" y="{sy+1.1:.1f}" width="{pw:.1f}" height="{ph:.1f}" rx="0.9" fill="{DARK}"/>')
        else:
            ph2, pw2 = sh*0.36, 1.8
            out.append(f'<rect x="{sx+1.1:.1f}" y="{cy-ph2/2:.1f}" width="{pw2:.1f}" height="{ph2:.1f}" rx="0.9" fill="{DARK}"/>')
    else:
        if not land:
            out.append(f'<circle cx="{cx:.1f}" cy="{sy+2.4:.1f}" r="1.1" fill="{DARK}"/>')
        else:
            out.append(f'<circle cx="{sx+2.4:.1f}" cy="{cy:.1f}" r="1.1" fill="{DARK}"/>')
    return "".join(out)

# arrangements use the CONSTANT screen size
def arrangement(layout):
    if layout == "one":  return [(75, DEV_CY, PW, PH)]
    if layout == "two":  return [(55, DEV_CY, PW, PH), (95, DEV_CY, PW, PH)]
    if layout == "four":
        xs = [22.5, 57.5, 92.5, 127.5]
        return [(x, DEV_CY, PW, PH) for x in xs]
    if layout in ("one_land", "one_land2"): return [(75, DEV_CY, LW, LH)]
    if layout == "four_land":
        return [(40, DEV_CY-18, LW, LH), (110, DEV_CY-18, LW, LH),
                (40, DEV_CY+18, LW, LH), (110, DEV_CY+18, LW, LH)]
    return [(75, DEV_CY, PW, PH)]

def swatch(layout, variant):
    x, y, w, h = 80, 128, 60, 52          # ~2x previous
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="none" stroke="{LGRAY}" stroke-width="1.4"/>']
    px, py, pw, ph = x+7, y+7, w-14, h-14
    horiz = (layout == "one_land")        # this layout's columns are horizontal bands
    if variant in ("col", "colgrid"):
        if not horiz:
            for i in range(6):
                bx = px + i*(pw/6) + 1.2
                out.append(f'<rect x="{bx:.1f}" y="{py:.1f}" width="{pw/6-2.4:.1f}" height="{ph:.1f}" fill="{SW}"/>')
        else:
            for i in range(4):
                by = py + i*(ph/4) + 1
                out.append(f'<rect x="{px:.1f}" y="{by:.1f}" width="{pw:.1f}" height="{ph/4-2:.1f}" fill="{SW}"/>')
    if variant in ("grid", "colgrid"):
        col = "#fff" if variant == "colgrid" else GRAY
        swd = 1.1 if variant == "colgrid" else 1.2
        for i in range(1, 6):
            gx = px + i*pw/6
            out.append(f'<line x1="{gx:.1f}" y1="{py:.1f}" x2="{gx:.1f}" y2="{py+ph:.1f}" stroke="{col}" stroke-width="{swd}"/>')
        for j in range(1, 4):
            gy = py + j*ph/4
            out.append(f'<line x1="{px:.1f}" y1="{gy:.1f}" x2="{px+pw:.1f}" y2="{gy:.1f}" stroke="{col}" stroke-width="{swd}"/>')
    return "".join(out)

def icon_svg(device, layout, variant):
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="150" height="200" viewBox="0 0 150 200">',
             '<rect width="150" height="200" fill="#ffffff"/>']
    for (cx, cy, bw, bh) in arrangement(layout):
        parts.append(phone(cx, cy, bw, bh, device))
    # platform logo + swatch, side by side underneath
    parts.append(apple(38, 154) if device == "iphone" else android(38, 156))
    parts.append(swatch(layout, variant))
    parts.append('</svg>')
    return "".join(parts)

def icon_b64(device, layout, variant):
    return base64.b64encode(icon_svg(device, layout, variant).encode("utf-8")).decode("ascii")
