#!/usr/bin/env python3
"""Regenerate the universal template set into ../templates/universal/.
Stdlib only. Run from the src/ directory:  python3 build.py"""
import os, glob, json
import gen_methods as gm, gen_templates as g

OUT = os.path.join(os.path.dirname(__file__) or ".", "..", "templates", "universal")

# The rM2 renders the Methods canvas rotated 90 deg vs the Paper Pro, so a single
# static template can't be upright on both. We emit two coordinate sets into one
# install dir; supportedScreens makes each device pick up only its own (the picker
# hides the rest), so the copy-everything installer still works on both devices.
#   suffix ""      -> Paper Pro, unrotated       supportedScreens ["rmPP"]
#   suffix "_rm2"  -> reMarkable 2, rotated 90    supportedScreens ["rm2"]
TARGETS = [
    dict(suffix="",     screens=["rmPP"], rotate=False),
    dict(suffix="_rm2", screens=["rm2"],  rotate=True),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "uxtpl_*")):
        os.remove(f)
    rows = []
    for t in TARGETS:
        gm.SUPPORTED_SCREENS = t["screens"]
        gm.ROTATE_90 = t["rotate"]
        for dev, _ in g.DEVICES:
            for lay in g.LAYOUTS:
                for var in g.VARIANTS:
                    base = f"uxtpl_{dev}_{lay}_{var}{t['suffix']}"
                    name, _ = gm.write_template(OUT, base, dev, lay, var)
                    rows.append((name, base))
    for p in glob.glob(os.path.join(OUT, "*.template")) + glob.glob(os.path.join(OUT, "*.metadata")):
        json.load(open(p))
    with open(os.path.join(OUT, "MANIFEST.txt"), "w") as f:
        for name, base in sorted(rows, key=lambda r: r[1]):
            f.write(f"{name:26s}  {base}\n")
    print(f"wrote {len(rows)} templates ({len(rows)*3} files) -> {OUT}")

if __name__ == "__main__":
    main()
