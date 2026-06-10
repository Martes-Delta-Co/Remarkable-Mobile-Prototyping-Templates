import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Catalog, Design } from "./catalog";
import { cellKey, selectDesigns, selectedFiles } from "./selection";

// Tests run against the REAL generated catalog the app ships, so they verify the
// actual install set for each checkbox combination — not a hand-rolled fixture.
const catalog: Catalog = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/catalog.json", import.meta.url)), "utf8"),
);
const DESIGNS = catalog.designs;
const MODELS = catalog.axes.models.map((m) => m.key);
const VARIANTS = catalog.axes.variants.map((v) => v.key);
const LAYOUTS = catalog.axes.layouts.map((l) => l.key);
const ALL_LAYOUTS = () => new Set(LAYOUTS);

const cells = (pairs: [string, string][]) => new Set(pairs.map(([m, v]) => cellKey(m, v)));
const ids = (ds: Design[]) => ds.map((d) => d.id).sort();
const ALL_CELLS = MODELS.flatMap((m) => VARIANTS.map((v) => [m, v] as [string, string]));

// Independent lookup table (model|variant|layout) -> design, built WITHOUT
// selectDesigns. Tests assert the selection equals the exact cartesian product
// of (checked cells) × (enabled layouts), rather than just restating the filter.
const byTriple = new Map<string, Design>();
for (const d of DESIGNS) byTriple.set(`${d.model}|${d.variant}|${d.layout}`, d);

function expectedIds(pairs: [string, string][], layouts: string[]): string[] {
  const out: string[] = [];
  for (const [m, v] of pairs)
    for (const l of layouts) {
      const d = byTriple.get(`${m}|${v}|${l}`);
      expect(d, `no design for ${m}/${v}/${l}`).toBeDefined();
      out.push(d!.id);
    }
  return out.sort();
}

describe("catalog fixture is well-formed", () => {
  it("has the expected axis sizes (2 models × 3 variants × 6 layouts = 36)", () => {
    expect(MODELS).toHaveLength(2);
    expect(VARIANTS).toHaveLength(3);
    expect(LAYOUTS).toHaveLength(6);
    expect(DESIGNS).toHaveLength(36);
  });

  it("every design sits on a known cell and layout", () => {
    for (const d of DESIGNS) {
      expect(MODELS).toContain(d.model);
      expect(VARIANTS).toContain(d.variant);
      expect(LAYOUTS).toContain(d.layout);
    }
  });

  it("every (model, variant, layout) triple is unique", () => {
    expect(byTriple.size).toBe(DESIGNS.length);
  });

  it("each (model, variant) cell has exactly one design per layout", () => {
    for (const m of MODELS)
      for (const v of VARIANTS)
        expect(DESIGNS.filter((d) => d.model === m && d.variant === v)).toHaveLength(LAYOUTS.length);
  });

  it("every design ships both screen variants, each with 3 namespaced files", () => {
    for (const d of DESIGNS) {
      expect(d.targets.map((t) => t.screen).sort()).toEqual(["rm2", "rmPP"]);
      for (const t of d.targets) {
        expect(t.files).toHaveLength(3);
        expect(t.files.every((f) => f.startsWith("uxtpl_"))).toBe(true);
      }
    }
  });
});

describe("nothing checked installs nothing", () => {
  it("no cells selected → no designs, no files", () => {
    const sel = selectDesigns(DESIGNS, new Set(), ALL_LAYOUTS());
    expect(sel).toEqual([]);
    expect(selectedFiles(sel)).toEqual([]);
  });

  it("cells checked but every layout toggled off → nothing", () => {
    const sel = selectDesigns(DESIGNS, cells([["iphone", "col"], ["android", "grid"]]), new Set());
    expect(sel).toEqual([]);
    expect(selectedFiles(sel)).toEqual([]);
  });
});

describe("a single checked cell selects that model×variant across all layouts", () => {
  for (const m of MODELS)
    for (const v of VARIANTS)
      it(`${m} × ${v} → 6 designs (one per layout)`, () => {
        const sel = selectDesigns(DESIGNS, cells([[m, v]]), ALL_LAYOUTS());
        expect(sel).toHaveLength(LAYOUTS.length);
        expect(sel.every((d) => d.model === m && d.variant === v)).toBe(true);
        expect(new Set(sel.map((d) => d.layout))).toEqual(new Set(LAYOUTS));
        expect(ids(sel)).toEqual(expectedIds([[m, v]], LAYOUTS));
      });

  it("installs 6 designs × 6 files, both screen variants, with no duplicates", () => {
    const sel = selectDesigns(DESIGNS, cells([["iphone", "col"]]), ALL_LAYOUTS());
    const files = selectedFiles(sel);
    expect(files).toHaveLength(LAYOUTS.length * 6); // 6 designs × (2 screens × 3 files)
    expect(files.every((f) => f.startsWith("uxtpl_"))).toBe(true);
    expect(new Set(files).size).toBe(files.length);
    for (const d of sel) {
      expect(files).toContain(`${d.id}.template`); // rmPP
      expect(files).toContain(`${d.id}_rm2.template`); // rm2
    }
  });
});

describe("layout toggles filter within the checked cells", () => {
  it("one cell + one layout → exactly that single design", () => {
    const sel = selectDesigns(DESIGNS, cells([["iphone", "grid"]]), new Set(["one"]));
    expect(sel).toHaveLength(1);
    expect(ids(sel)).toEqual(expectedIds([["iphone", "grid"]], ["one"]));
  });

  it("one cell + two layouts → exactly those two designs", () => {
    const sel = selectDesigns(DESIGNS, cells([["android", "colgrid"]]), new Set(["one", "four"]));
    expect(sel).toHaveLength(2);
    expect(ids(sel)).toEqual(expectedIds([["android", "colgrid"]], ["one", "four"]));
  });
});

describe("multiple checked cells union without overlap", () => {
  it("two cells → union of both columns (12 designs)", () => {
    const picked: [string, string][] = [["iphone", "col"], ["android", "grid"]];
    const sel = selectDesigns(DESIGNS, cells(picked), ALL_LAYOUTS());
    expect(sel).toHaveLength(12);
    expect(ids(sel)).toEqual(expectedIds(picked, LAYOUTS));
    expect(new Set(ids(sel)).size).toBe(sel.length); // no overlap
  });

  it("a whole model row (all variants) → 18 designs of that model", () => {
    const picked = VARIANTS.map((v) => ["iphone", v] as [string, string]);
    const sel = selectDesigns(DESIGNS, cells(picked), ALL_LAYOUTS());
    expect(sel).toHaveLength(VARIANTS.length * LAYOUTS.length);
    expect(sel.every((d) => d.model === "iphone")).toBe(true);
    expect(ids(sel)).toEqual(expectedIds(picked, LAYOUTS));
  });

  it("a whole variant column (all models) → 12 designs of that variant", () => {
    const picked = MODELS.map((m) => [m, "colgrid"] as [string, string]);
    const sel = selectDesigns(DESIGNS, cells(picked), ALL_LAYOUTS());
    expect(sel).toHaveLength(MODELS.length * LAYOUTS.length);
    expect(sel.every((d) => d.variant === "colgrid")).toBe(true);
    expect(ids(sel)).toEqual(expectedIds(picked, LAYOUTS));
  });
});

describe("select-all installs the entire catalog", () => {
  it("every cell + every layout → all 36 designs and all 216 files, each once", () => {
    const sel = selectDesigns(DESIGNS, cells(ALL_CELLS), ALL_LAYOUTS());
    expect(ids(sel)).toEqual(ids(DESIGNS));

    const files = selectedFiles(sel);
    const everyFile = DESIGNS.flatMap((d) => d.targets.flatMap((t) => t.files));
    expect(files).toHaveLength(DESIGNS.length * 6); // 36 × 6 = 216
    expect(new Set(files).size).toBe(files.length); // no duplicates
    expect(new Set(files)).toEqual(new Set(everyFile));
  });
});

describe("selection is exactly (checked cells) × (enabled layouts)", () => {
  const subsets: { name: string; cells: [string, string][]; layouts: string[] }[] = [
    { name: "nothing", cells: [], layouts: LAYOUTS },
    { name: "one cell, one layout", cells: [["iphone", "col"]], layouts: ["one"] },
    {
      name: "two cells, three layouts",
      cells: [["iphone", "col"], ["android", "colgrid"]],
      layouts: ["one", "two", "four_land"],
    },
    { name: "all cells, one layout", cells: ALL_CELLS, layouts: ["one_land2"] },
    { name: "one cell, no layouts", cells: [["android", "grid"]], layouts: [] },
    { name: "everything", cells: ALL_CELLS, layouts: LAYOUTS },
  ];

  for (const s of subsets)
    it(s.name, () => {
      const sel = selectDesigns(DESIGNS, cells(s.cells), new Set(s.layouts));
      expect(ids(sel)).toEqual(expectedIds(s.cells, s.layouts));
      // files are exactly the union of the selected designs' files
      expect(selectedFiles(sel)).toEqual(sel.flatMap((d) => d.targets.flatMap((t) => t.files)));
    });
});
