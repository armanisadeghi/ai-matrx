/** The spec: states-catalog.json in common-docs meet/duplicates. */
import { readFileSync } from "node:fs";
import { CATALOG_PATH } from "./env";

export interface CatalogState {
  id: string;
  situation: string;
  who: string;
  requirement: string;
  priority: string;
  today: { status: string; note: string };
}

export function catalogStates(): CatalogState[] {
  const data = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as { categories: { states: CatalogState[] }[] };
  return data.categories.flatMap((c) => c.states);
}

export const P0_IDS = catalogStates().filter((s) => s.priority === "P0").map((s) => s.id);

