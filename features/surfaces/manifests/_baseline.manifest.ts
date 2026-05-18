/**
 * Baseline SurfaceValue catalog.
 *
 * Most surfaces want to advertise the same handful of values (selection,
 * content, context) so legacy code that uses the universal scope keys
 * (`UnifiedAgentContextMenu`'s `selection` / `content` / `context`) keeps
 * working without touching the resolver.
 *
 * Manifests can spread `BASELINE_VALUES` (or a subset) into their own
 * declarations to inherit the canonical descriptions/labels. Override any
 * field by listing the value again with a different shape — last-write wins
 * in `mergeBaselineValues`.
 */

import type { SurfaceValue } from "@/features/surfaces/types";

/** Universally-recognized values. Surfaces opt in by spreading. */
export const BASELINE_VALUES = {
  selection: {
    name: "selection",
    label: "Current selection",
    description:
      "The user's currently selected text on the surface. Empty string when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 100,
  },
  text_before: {
    name: "text_before",
    label: "Text before selection",
    description:
      "Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 110,
  },
  text_after: {
    name: "text_after",
    label: "Text after selection",
    description:
      "Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 120,
  },
  content: {
    name: "content",
    label: "Primary content",
    description:
      "The surface's primary editable content (full document, full note, full file body). Use with care — can be large.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    sortOrder: 200,
  },
  context: {
    name: "context",
    label: "Free-form context",
    description:
      "Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 9999,
  },
} as const satisfies Record<string, SurfaceValue>;

export type BaselineKey = keyof typeof BASELINE_VALUES;

/** Pick a subset of baseline values by key. */
export function pickBaseline(...keys: BaselineKey[]): SurfaceValue[] {
  return keys.map((k) => BASELINE_VALUES[k]);
}

/**
 * Merge baseline values with surface-specific overrides. Override entries
 * (matched by `name`) replace the baseline ones; new entries are appended.
 */
export function mergeBaselineValues(
  baseline: readonly SurfaceValue[],
  overrides: readonly SurfaceValue[],
): SurfaceValue[] {
  const byName = new Map<string, SurfaceValue>();
  for (const v of baseline) byName.set(v.name, v);
  for (const v of overrides) byName.set(v.name, v);
  return Array.from(byName.values()).sort(
    (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
  );
}
