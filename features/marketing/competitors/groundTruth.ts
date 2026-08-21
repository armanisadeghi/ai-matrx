/**
 * features/marketing/competitors/groundTruth.ts
 *
 * THE RULING RECORD — what a human decision about a competitor must capture.
 *
 * System of record: `common-docs/systems/marketing/competitor-classification/FEATURE.md`
 * §10. Zero competitors and zero referring domains in this platform have ever
 * been human-ruled, so every threshold in that document is provisional. The
 * missing thing is LABELS, not data volume — more API calls cannot fix it.
 *
 * Four things per ruling, and the LAST ONE is the training signal:
 *   1. the axes the human set,
 *   2. the label they would have used,
 *   3. whether OUR proposal was right,
 *   4. **in their own words, why.**
 *
 * (3) is why the proposal is snapshotted beside the ruling rather than
 * overwritten: "we were right" and "we were wrong" are only distinguishable if
 * both versions survive. (4) is free text on purpose — the moment it becomes a
 * dropdown it stops being evidence about how a real expert thinks.
 *
 * This lands in `seo.competitor.human_ruling`, the provenance bucket that
 * ALWAYS WINS (FEATURE.md §6). It is never a note in a file.
 */

import type { CompetitorRow } from "./data";

/** The axes a human can rule on. Mirrors the live CHECK constraints. */
export interface CompetitorAxes {
  business_overlap: string | null;
  market_overlap: string | null;
  entity_role: string | null;
  peer_scale: string | null;
  posture: string | null;
  use_for_link_gap: boolean | null;
}

export interface CompetitorRuling {
  /** Which surface the human was looking at when they decided. */
  source: string;
  decided_at: string;
  verdict: "agreed" | "corrected";
  /** What the machine proposed, frozen. Without this, (3) is unanswerable. */
  proposal: CompetitorAxes & { label: string };
  ruling: CompetitorAxes & { label: string };
  /** Exactly which axes the human moved — the cheap aggregate query. */
  changed_axes: string[];
  /** The label they would have used, if ours did not fit. */
  label_would_have_used: string;
  /** THEIR WORDS. The reason this whole record exists. */
  why: string;
  /** Which layer produced the proposal, and the exact rule if deterministic. */
  proposed_by: string;
  proposed_rule: string;
  proposed_confidence: number | null;
}

const AXIS_KEYS = [
  "business_overlap",
  "market_overlap",
  "entity_role",
  "peer_scale",
  "posture",
  "use_for_link_gap",
] as const;

/** The machine's proposal as it was recorded at classification time. */
export function proposalOf(row: CompetitorRow): {
  axes: CompetitorAxes;
  layer: string;
  rule: string;
  confidence: number | null;
} {
  const classification = (
    row.latest_autopsy as {
      classification?: Record<string, unknown>;
    } | null
  )?.classification;
  const read = (key: string): unknown => classification?.[key];
  const asString = (value: unknown): string | null =>
    typeof value === "string" ? value : null;
  return {
    axes: {
      // Fall back to the row's own columns: on the deterministic path the
      // columns and the snapshot always agree, and on an older row the
      // snapshot may predate an axis entirely.
      business_overlap: asString(read("business_overlap")) ?? row.business_overlap,
      market_overlap: asString(read("market_overlap")) ?? row.market_overlap,
      entity_role: asString(read("entity_role")) ?? row.entity_role,
      peer_scale: asString(read("peer_scale")) ?? row.peer_scale,
      posture: asString(read("posture")) ?? row.posture,
      use_for_link_gap:
        typeof read("use_for_link_gap") === "boolean"
          ? (read("use_for_link_gap") as boolean)
          : row.use_for_link_gap,
    },
    layer: asString(read("layer")) ?? "unknown",
    rule: asString(read("rule")) ?? "",
    confidence:
      typeof read("confidence") === "number" ? (read("confidence") as number) : null,
  };
}

export function axesOf(row: Pick<CompetitorRow, keyof CompetitorAxes>): CompetitorAxes {
  return {
    business_overlap: row.business_overlap,
    market_overlap: row.market_overlap,
    entity_role: row.entity_role,
    peer_scale: row.peer_scale,
    posture: row.posture,
    use_for_link_gap: row.use_for_link_gap,
  };
}

export function changedAxes(
  proposal: CompetitorAxes,
  ruling: CompetitorAxes,
): string[] {
  return AXIS_KEYS.filter((key) => proposal[key] !== ruling[key]);
}

/**
 * Assemble the ruling. `labelOf` is passed in rather than imported so this
 * module stays free of React and of the label component's import graph.
 */
export function buildRuling(input: {
  row: CompetitorRow;
  ruling: CompetitorAxes;
  why: string;
  labelWouldHaveUsed?: string;
  source: string;
  labelOf: (axes: CompetitorAxes & { search_overlap_band: string | null }) => string;
}): CompetitorRuling {
  const proposed = proposalOf(input.row);
  const band = input.row.search_overlap_band;
  const changed = changedAxes(proposed.axes, input.ruling);
  return {
    source: input.source,
    decided_at: new Date().toISOString(),
    verdict: changed.length === 0 ? "agreed" : "corrected",
    proposal: {
      ...proposed.axes,
      label: input.labelOf({ ...proposed.axes, search_overlap_band: band }),
    },
    ruling: {
      ...input.ruling,
      label: input.labelOf({ ...input.ruling, search_overlap_band: band }),
    },
    changed_axes: changed,
    label_would_have_used: input.labelWouldHaveUsed?.trim() ?? "",
    why: input.why.trim(),
    proposed_by: proposed.layer,
    proposed_rule: proposed.rule,
    proposed_confidence: proposed.confidence,
  };
}
