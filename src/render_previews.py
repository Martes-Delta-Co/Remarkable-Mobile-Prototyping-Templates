#!/usr/bin/env python3
"""Render preview images into ../preview/  (needs: pip install cairosvg pillow).
Run from src/:  python3 render_previews.py"""
import os, io, cairosvg
from PIL import Image
import gen_templates as g, gen_methods as gm

PREV = os.path.join(os.path.dirname(__file__) or ".", "..", "preview")
os.makedirs(PREV, exist_ok=True)

def item_to_svg(it):
    d=[]; data=it["data"]; i=0
    while i < len(data):
        c=data[i]
        if c in ("M","L"):
            x=float(str(data[i+1]).replace("* sx","").replace("*sx",""))
            y=float(str(data[i+2]).replace("* sy","").replace("*sy",""))
            d.append(f"{c}{x} {y}"); i+=3
        elif c=="Z": d.append("Z"); i+=1
        else: i+=1
    dd="".join(d)
    if "fillColor" in it: return f'<path d="{dd}" fill="{it["fillColor"]}" fill-rule="evenodd"/>'
    return f'<path d="{dd}" fill="none" stroke="#000" stroke-width="{it.get("strokeWidth",1)}"/>'

def page_png(dev, lay, var, w):
    spec = g.ANDROID if dev=="android" else g.IPHONE
    body = "".join(item_to_svg(it) for it in gm.build_items(spec, lay, var))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="2160" height="2880" '
           f'viewBox="0 0 2160 2880"><rect width="2160" height="2880" fill="#fff"/>{body}</svg>')
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=int(w*2880/2160))
    return Image.open(io.BytesIO(png)).convert("RGB")

def contact_sheet():
    cols = [(d,v) for d in ("iphone","android") for v in g.VARIANTS]
    tw=300; th=int(tw*2880/2160); pad=14
    W=len(cols)*tw+(len(cols)+1)*pad; H=len(g.LAYOUTS)*th+(len(g.LAYOUTS)+1)*pad
    c=Image.new("RGB",(W,H),"#e9e9e9")
    for r,lay in enumerate(g.LAYOUTS):
        for ci,(d,v) in enumerate(cols):
            c.paste(page_png(d,lay,v,tw),(pad+ci*(tw+pad),pad+r*(th+pad)))
    c.save(os.path.join(PREV,"all-templates.png")); print("preview/all-templates.png")

def heroes():
    for dev,lay,var,nm in [("iphone","one","colgrid","hero-iphone-1up-colgrid"),
                           ("android","one_land2","col","hero-android-1up-wide-col")]:
        page_png(dev,lay,var,900).save(os.path.join(PREV,nm+".png")); print("preview/"+nm+".png")

if __name__ == "__main__":
    contact_sheet(); heroes()
