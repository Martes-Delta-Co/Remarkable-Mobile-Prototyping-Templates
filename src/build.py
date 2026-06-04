#!/usr/bin/env python3
"""Regenerate the universal template set into ../templates/universal/.
Stdlib only. Run from the src/ directory:  python3 build.py"""
import os, glob, json
import gen_methods as gm, gen_templates as g

OUT = os.path.join(os.path.dirname(__file__) or ".", "..", "templates", "universal")
gm.SUPPORTED_SCREENS = ["rm2", "rmPP"]   # appear on both devices

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "uxtpl_*")):
        os.remove(f)
    rows = []
    for dev, _ in g.DEVICES:
        for lay in g.LAYOUTS:
            for var in g.VARIANTS:
                base = f"uxtpl_{dev}_{lay}_{var}"
                name, _ = gm.write_template(OUT, base, dev, lay, var)
                rows.append((name, base))
    for p in glob.glob(os.path.join(OUT, "*.template")) + glob.glob(os.path.join(OUT, "*.metadata")):
        json.load(open(p))
    with open(os.path.join(OUT, "MANIFEST.txt"), "w") as f:
        for name, base in sorted(rows):
            f.write(f"{name:26s}  {base}\n")
    print(f"wrote {len(rows)} templates ({len(rows)*3} files) -> {OUT}")

if __name__ == "__main__":
    main()
