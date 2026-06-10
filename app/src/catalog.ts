import type { TemplateDoc } from "./renderer";

export interface Axis {
  key: string;
  name: string;
}
export interface Target {
  screen: "rmPP" | "rm2";
  files: string[];
}
export interface Design {
  id: string;
  visibleName: string;
  formFactor: string;
  model: string;
  modelName: string;
  variant: string;
  variantName: string;
  layout: string;
  layoutLabel: string;
  orientation: string;
  targets: Target[];
  template: TemplateDoc;
}
export interface Catalog {
  schemaVersion: number;
  designSpace: { width: number; height: number };
  axes: { models: Axis[]; variants: Axis[]; layouts: Axis[] };
  designs: Design[];
}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch("catalog.json");
  if (!res.ok) throw new Error(`failed to load catalog.json: ${res.status}`);
  return res.json();
}
