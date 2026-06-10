import type { Design } from "./catalog";

// The picker is a grid of model×variant cells plus a row of layout toggles.
// A design installs iff its cell is checked AND its layout is enabled. These
// pure helpers are the single source of truth for "what would be installed",
// shared by the UI (main.ts) and the tests (selection.test.ts).

export const cellKey = (model: string, variant: string) => `${model}|${variant}`;

/** Designs whose model×variant cell is selected AND whose layout is enabled. */
export function selectDesigns(
  designs: Design[],
  selectedCells: Set<string>,
  enabledLayouts: Set<string>,
): Design[] {
  return designs.filter(
    (d) => selectedCells.has(cellKey(d.model, d.variant)) && enabledLayouts.has(d.layout),
  );
}

/** Flat list of device files an install of these designs would write (both screen variants). */
export function selectedFiles(designs: Design[]): string[] {
  return designs.flatMap((d) => d.targets.flatMap((t) => t.files));
}
