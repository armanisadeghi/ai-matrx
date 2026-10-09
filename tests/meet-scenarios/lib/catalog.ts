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

export const P1_IDS = catalogStates().filter((s) => s.priority === "P1").map((s) => s.id);

/** The state ids a run is expected to cover: MEET_SET=p0 | p1 | (unset = both). */
export function expectedIds(): string[] {
  const set = (process.env.MEET_SET ?? "").toLowerCase();
  return set === "p0" ? P0_IDS : set === "p1" ? P1_IDS : [...P0_IDS, ...P1_IDS];
}
