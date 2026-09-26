/**
 * No two record kinds share a plural label. Pickers (the link sheet, filters, "attach" chips) show the
 * PLURAL; two kinds both reading "Flashcards" (fc_card and fc_set) was a duplicate choice with no way to
 * tell them apart (RC-B11 link picker, 2026-09-26).
 */
import { ENTITY_TYPE_TOKENS } from "@ai-matrx/associations";
import { tryGetEntityInfo } from "../entityRegistry";

/**
 * Pairs whose SINGULAR label is duplicated in platform.entity_types itself — renaming a kind is a
 * vocabulary ruling (never coined by an agent), so they wait here, named, until it is made. This list
 * only shrinks: an entry that no longer collides fails the test until it is deleted.
 */
const AWAITING_A_NAMING_RULING = new Set([
  "Access audits: hr_access_audit, iam_access_audit",
  "Analysis Results: analysis_result, web_result",
  "Locations: hr_location, location",
  "YouTube Videos: web_youtube_video, youtube_video",
]);

it("every registered kind has its own plural label", () => {
  const byPlural = new Map<string, string[]>();
  for (const token of ENTITY_TYPE_TOKENS) {
    const info = tryGetEntityInfo(token);
    if (!info) continue;
    const plural = (info as { labelPlural?: string }).labelPlural;
    if (!plural) continue;
    byPlural.set(plural, [...(byPlural.get(plural) ?? []), token]);
  }
  const dupes = [...byPlural].filter(([, tokens]) => tokens.length > 1).map(([p, t]) => `${p}: ${[...t].sort().join(", ")}`);
  expect(dupes.filter((d) => !AWAITING_A_NAMING_RULING.has(d))).toEqual([]);
  expect([...AWAITING_A_NAMING_RULING].filter((d) => !dupes.includes(d))).toEqual([]);
});
