#!/usr/bin/env python3
"""Build catalog.json from templates/universal/.

One entry per design (the canonical rmPP file; the _rm2 twin is recorded under
`targets` but never rendered — its coords are pre-rotated). Embeds each design's
`constants` + `items` so the in-app renderer can draw a faithful thumbnail.

Run:  python3 generators/build_catalog.py
Writes: app/public/catalog.json  (the data the app loads) and catalog/catalog.json
"""
import os, glob, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "templates", "universal")
OUTS = [os.path.join(ROOT, "app", "public", "catalog.json"),
        os.path.join(ROOT, "catalog", "catalog.json")]

# taxonomy: filename token -> display + ordering
MODELS = {
    "iphone":  dict(model="iphone",  name="iPhone",        formFactor="phone"),
    "android": dict(model="android", name="Android phone", formFactor="phone"),
}
VARIANTS = {
    "col":     dict(key="col",     name="12-column"),
    "grid":    dict(key="grid",    name="Grid"),
    "colgrid": dict(key="colgrid", name="Both"),
}
LAYOUTS = {
    "one":       "1UP",
    "two":       "2UP",
    "four":      "4UP",
    "one_land":  "1UP LS",
    "one_land2": "1UP WIDE",
    "four_land": "4UP LS",
}
# stable display order for the picker axes
MODEL_ORDER   = ["iphone", "android"]
VARIANT_ORDER = ["col", "grid", "colgrid"]
LAYOUT_ORDER  = ["one", "two", "four", "one_land", "one_land2", "four_land"]


def parse_base(base):
    """uxtpl_{model}_{layout}_{variant} -> (model, layout, variant)."""
    rest = base[len("uxtpl_"):]
    for model in MODELS:
        if rest.startswith(model + "_"):
            tail = rest[len(model) + 1:]
            for var in VARIANTS:
                if tail.endswith("_" + var):
                    layout = tail[: -(len(var) + 1)]
                    return model, layout, var
    raise ValueError(f"cannot parse base: {base}")


def main():
    designs = []
    for tpl in sorted(glob.glob(os.path.join(SRC, "uxtpl_*.template"))):
        base = os.path.basename(tpl)[: -len(".template")]
        if base.endswith("_rm2"):
            continue  # canonical = rmPP; the _rm2 twin is a target, not a design
        model, layout, variant = parse_base(base)
        t = json.load(open(tpl))
        meta = json.load(open(os.path.join(SRC, base + ".metadata")))

        targets = [dict(screen="rmPP",
                        files=[base + ext for ext in (".content", ".metadata", ".template")])]
        rm2 = base + "_rm2"
        if os.path.exists(os.path.join(SRC, rm2 + ".template")):
            targets.append(dict(screen="rm2",
                                files=[rm2 + ext for ext in (".content", ".metadata", ".template")]))

        designs.append(dict(
            id=base,
            visibleName=meta["visibleName"],
            formFactor=MODELS[model]["formFactor"],
            model=model,
            modelName=MODELS[model]["name"],
            variant=variant,
            variantName=VARIANTS[variant]["name"],
            layout=layout,
            layoutLabel=LAYOUTS[layout],
            orientation=t.get("orientation", "portrait"),
            targets=targets,
            template=dict(constants=t["constants"], items=t["items"]),
        ))

    axes = dict(
        models=[dict(key=k, name=MODELS[k]["name"]) for k in MODEL_ORDER
                if any(d["model"] == k for d in designs)],
        variants=[dict(key=k, name=VARIANTS[k]["name"]) for k in VARIANT_ORDER
                  if any(d["variant"] == k for d in designs)],
        layouts=[dict(key=k, name=LAYOUTS[k]) for k in LAYOUT_ORDER
                 if any(d["layout"] == k for d in designs)],
    )

    catalog = dict(schemaVersion=1, designSpace=dict(width=2160, height=2880),
                   axes=axes, designs=designs)

    for out in OUTS:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        json.dump(catalog, open(out, "w"), indent=2)
    print(f"wrote {len(designs)} designs to:")
    for out in OUTS:
        print(f"  {os.path.relpath(out, ROOT)}  ({os.path.getsize(out)//1024} KB)")


if __name__ == "__main__":
    main()
