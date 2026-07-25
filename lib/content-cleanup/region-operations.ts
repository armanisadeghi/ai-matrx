// lib/content-cleanup/region-operations.ts
//
// REGION operations — the mirror image of the ordinary cleanup operations.
//
// Ordinary ops run on the CLEANABLE text and may never touch a protected
// region. A region op is the opposite: it runs ONLY on a protected region, and
// only on the kinds it declares, because re-shaping JSON is a structural
// rewrite of the thing that whitespace cleanup is forbidden to go near.
//
// Why this class exists at all: a fenced JSON blob is protected precisely
// because collapsing its whitespace with a regex would destroy it. Re-printing
// it through a real JSON parser+writer does the opposite — it is the ONLY safe
// way to condense one. So the safety rule stays intact ("never regex inside a
// protected region") while the capability arrives.
//
// Invariants:
//   - Every region op is OFF by default. A note's JSON is the user's text.
//   - A region op returns `null` to decline (wrong kind, unparseable, already
//     in that shape). `null` is never "make it empty".
//   - Region ops are MUTUALLY EXCLUSIVE per region: the first enabled op that
//     produces a change wins, so "condense" and "expand" can never fight over
//     the same block and produce order-dependent nonsense.
//   - Reformatting is refused when the parse had to be TOLERANT (JSON5:
//     trailing commas, comments, unquoted keys). Re-emitting that as strict
//     JSON silently deletes the user's comments — a rewrite wearing a
//     cleanup's clothes.

import { detectJson } from "@/lib/json-format/detect";
import { formatJsonText } from "@/lib/json-format/format";
import type { JsonFormatStyle } from "@/lib/json-format/types";
import type {
  CleanupRegionOperationDef,
  CleanupRegionOperationId,
  ProtectedRegion,
} from "./types";

/** Region kinds that can hold JSON. */
const JSON_BEARING = new Set<ProtectedRegion["kind"]>([
  "json-block",
  "fenced-code",
]);

/**
 * Build a JSON re-format region op. `style` is the only thing that differs
 * between condense / minify / expand — the safety gate is shared.
 */
function jsonReformat(
  id: CleanupRegionOperationId,
  style: JsonFormatStyle,
  meta: { label: string; human: string; description: string },
): CleanupRegionOperationDef {
  return {
    id,
    ...meta,
    defaultEnabled: false,
    group: "structured",
    appliesTo(region) {
      if (!JSON_BEARING.has(region.kind)) return false;
      return true;
    },
    run(regionText) {
      const detection = detectJson(regionText);
      if (!detection.ok) return null;
      // Never normalize away comments / trailing commas the user wrote.
      if (detection.parser !== "strict") return null;
      const result = formatJsonText(regionText, { style, fence: "preserve" });
      if (!result.ok || !result.changed) return null;
      return result.text;
    },
  };
}

/**
 * The registry, in run order. Order is load-bearing: for any one region the
 * FIRST enabled op that returns a change is the one that applies.
 */
export const CLEANUP_REGION_OPERATIONS: CleanupRegionOperationDef[] = [
  jsonReformat("condense-json", "compact", {
    label: "Condense JSON",
    human: "Condensed JSON blocks",
    description:
      "Re-print JSON compactly — short objects and arrays on one line, still readable. Code fences are kept.",
  }),
  jsonReformat("minify-json", "minify", {
    label: "Minify JSON",
    human: "Minified JSON blocks to one line",
    description:
      "Squeeze each JSON block onto a single line with no optional spaces. Smallest possible.",
  }),
  jsonReformat("expand-json", "pretty", {
    label: "Expand JSON",
    human: "Expanded JSON blocks",
    description:
      "Re-print JSON with one entry per line and 2-space indentation.",
  }),
];

export const CLEANUP_REGION_OPERATION_META = CLEANUP_REGION_OPERATIONS.map(
  ({ id, label, description, defaultEnabled, group }) => ({
    id,
    label,
    description,
    defaultEnabled,
    group,
  }),
);

export const DEFAULT_ENABLED_REGION_OPERATIONS: CleanupRegionOperationId[] =
  CLEANUP_REGION_OPERATIONS.filter((o) => o.defaultEnabled).map((o) => o.id);

/**
 * How many protected regions in this report actually hold re-printable JSON.
 * A surface uses this to decide whether to offer the JSON controls at all —
 * "3 JSON blocks found" beats a dead toggle on a note with no JSON in it.
 * Counts only STRICT JSON, matching what the ops are willing to rewrite.
 */
export function countJsonRegions(
  content: string,
  regions: readonly ProtectedRegion[],
): number {
  let n = 0;
  for (const region of regions) {
    if (!JSON_BEARING.has(region.kind)) continue;
    const detection = detectJson(content.slice(region.start, region.end));
    if (detection.ok && detection.parser === "strict") n++;
  }
  return n;
}

/**
 * Apply the enabled region ops to one protected region.
 * Returns the rewritten text plus the id of the op that did it, or `null` when
 * every op declined.
 */
export function applyRegionOperations(
  region: ProtectedRegion,
  text: string,
  enabled: ReadonlySet<CleanupRegionOperationId>,
): { text: string; opId: CleanupRegionOperationId } | null {
  for (const op of CLEANUP_REGION_OPERATIONS) {
    if (!enabled.has(op.id)) continue;
    if (!op.appliesTo(region, text)) continue;
    const next = op.run(text);
    if (next !== null && next !== text) {
      return { text: next, opId: op.id };
    }
  }
  return null;
}
