/**
 * THE REMEDIES of the visibility-vocabulary check — one per class of finding, each a remedy a
 * caller can actually use.
 *
 * Found 2026-09-28 (cleanup-worker dry run, round 3): the check's single hint told everyone to
 * "normalize legacy reads via toVisibility()", but `toVisibility` was private to
 * `features/files/redux/converters.ts` — nobody outside that file could import it, and the
 * packet's remedy lookup reported it NOT EXPORTED. A hint that names an unreachable function is a
 * dead end for a person and a guess for a model.
 *
 * So every remedy carries:
 *   fix      — the hint printed under the item (and handed to the cleanup worker as `fix_hint`);
 *   imports  — every symbol the fix names, with the module a caller imports it from;
 *   before   — a line the check reports as this class;
 *   after    — the same line with the remedy applied, which the check does NOT report.
 * `remedies.test.mjs` proves all four against the real check and the real modules.
 *
 * This file sits under scripts/visibility-vocab/, which the check exempts from its own scan.
 */

/** @typedef {{ name: string, from: string }} RemedyImport */
/** @typedef {{ kind: string, fix: string, imports: RemedyImport[], before: string, after: string }} Remedy */

/** @type {Record<"retiredSpelling" | "collapsedUnion" | "onlyYouClaim", Remedy>} */
export const REMEDIES = {
  retiredSpelling: {
    kind: "retiredSpelling",
    fix:
      "Use the canonical values 'personal' | 'internal' | 'link' | 'public' — " +
      'import type { Visibility } from "@/features/files/types". To read a value that may still carry a ' +
      'retired spelling, normalize it with toVisibility(raw) — import { toVisibility } from ' +
      '"@/features/files/redux/converters" — and never write \'shared\' or \'private\' to the server.',
    imports: [
      { name: "Visibility", from: "@/features/files/types" },
      { name: "toVisibility", from: "@/features/files/redux/converters" },
    ],
    before: `type Visibility = "personal" | "shared" | "public";\n`,
    after: `type Visibility = "personal" | "internal" | "link" | "public";\n`,
  },
  collapsedUnion: {
    kind: "collapsedUnion",
    fix:
      "Carry all four values ('personal' | 'internal' | 'link' | 'public'): " +
      'import type { Visibility } from "@/features/files/types" instead of declaring a narrower union.',
    imports: [{ name: "Visibility", from: "@/features/files/types" }],
    before: `type Visibility = "personal" | "public";\n`,
    after: `type Visibility = "personal" | "internal" | "link" | "public";\n`,
  },
  onlyYouClaim: {
    kind: "onlyYouClaim",
    fix:
      'Say what you know ("Personal" describes the setting, not who can read it), or show the true answer ' +
      'with <AccessSummaryPanel entityType entityId /> — import { AccessSummaryPanel } from ' +
      '"@/features/sharing/components/AccessSummaryPanel". Changing on-screen words is a person\'s decision.',
    imports: [{ name: "AccessSummaryPanel", from: "@/features/sharing/components/AccessSummaryPanel" }],
    before: `export const hint = "Only you can see it.";\n`,
    after: `export const hint = "Personal — visible according to its sharing.";\n`,
  },
};

/** The detector named in an item key (`<detector>|<file>|<line or *>`). */
export function detectorOfKey(key) {
  return String(key).split("|", 1)[0];
}

/** The remedy for ONE item, by its key; the all-classes summary when the key names no class. */
export function remedyForKey(key) {
  return REMEDIES[detectorOfKey(key)]?.fix ?? SUMMARY;
}

export const SUMMARY = Object.values(REMEDIES)
  .map((r) => `[${r.kind}] ${r.fix}`)
  .join(" ");
