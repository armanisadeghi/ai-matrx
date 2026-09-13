// features/masterwork/browse/approachLane.ts
//
// THE ONE MAP from a `platform.approach` registry row to the lane it opens.
//
// ## The class this closes (census row 3, 2026-09-12)
//
// The `timeline` Approach ("A case that unfolds in time") was seeded live with
// `intake_query = {"ingest":"timeline"}`, `enabled = true`,
// `metadata.availability = "available"`, and a real server lane behind it
// (`POST /masterworks/ingest-timeline`,
// `aidream/services/distillation/timeline_ingest.py`). The card rendered, was
// selectable, and Start created a Rulebook — and then dropped the Expert on a
// bare, empty detail page, because the dispatch in `RulebookDetailPage` was a
// hand-written three-way `q.ingest === "source" | "exemplar" | "file"` and a
// fourth value fell through to a URL push nothing read. No error, no toast, no
// capture UI: a fully live card that led nowhere.
//
// The instance was one missing `||`. The CLASS is that the registry could grow
// a row the code silently did not handle. So the mapping lives HERE as a pure
// function with a total return type — every caller gets `null` for an
// unmapped row and must say so out loud (NOTHING FAILS SILENTLY), and
// `features/masterwork/browse/__tests__/approachLaneCoverage.test.ts` reads the
// live registry and fails if any startable row resolves to `null`.

import type { DistillationApproach } from "./approaches";

/**
 * The ingest lanes of the "Add rules from a source" dialog. Each value is the
 * literal `intake_query.ingest` of a registry row, and the literal `?ingest=`
 * deep link on `/masterwork/[id]`.
 */
export const INGEST_LANES = [
  "source",
  "exemplar",
  "file",
  "timeline",
  // The VOICE-FIRST door (2026-09-12). The `monologue` Approach's server lane
  // has existed since the recording lane shipped — transcribe, chunk by time
  // range, distill through `masterwork.monologue_distiller`, anchor every rule
  // to the moment it was said — and the row sat `enabled=false` for the one
  // reason a row ever does: the product had no door. It is a lane of its own
  // and not a mode of `file` because an Expert who wants to TALK must not be
  // asked to go away and make a recording first.
  "monologue",
] as const;

export type IngestLane = (typeof INGEST_LANES)[number];

/** Narrow an arbitrary query value onto a real ingest lane, or null. */
export function toIngestLane(value: string | null | undefined): IngestLane | null {
  return INGEST_LANES.includes(value as IngestLane) ? (value as IngestLane) : null;
}

/** Where an Approach goes. One variant per real door in the product. */
export type ApproachLane =
  /** The registry row names its own page (`metadata.launch_href`). */
  | { kind: "href"; href: string }
  /** The Scout interview panel. */
  | { kind: "interview" }
  /** The "Add rules from a source" dialog, on a named lane. */
  | { kind: "ingest"; lane: IngestLane }
  /** The "Everything you've published" corpus dialog. */
  | { kind: "body_of_work" }
  /** The chat-import dialog, on one of its two tabs. */
  | { kind: "chatImport"; tab: "upload" | "matrx" }
  /** The Sources panel's dump staging area. */
  | { kind: "dump" }
  /** The Conductor conversation. */
  | { kind: "conduct" };

/**
 * Resolve a registry row to the lane it opens, or `null` when the product has
 * no door for it. `null` is never a silent state: the caller must tell the
 * Expert the lane is missing rather than leaving them on a bare page.
 */
export function resolveApproachLane(
  approach: Pick<DistillationApproach, "launchHref" | "intakeQuery">,
): ApproachLane | null {
  if (approach.launchHref) return { kind: "href", href: approach.launchHref };
  const q = approach.intakeQuery ?? {};
  if (q.interview === "1") return { kind: "interview" };
  const ingest = toIngestLane(q.ingest);
  if (ingest) return { kind: "ingest", lane: ingest };
  if (q.body_of_work === "1") return { kind: "body_of_work" };
  if (q.chatImport === "1")
    return { kind: "chatImport", tab: q.tab === "matrx" ? "matrx" : "upload" };
  if (q.dump === "1") return { kind: "dump" };
  if (q.conduct === "1") return { kind: "conduct" };
  return null;
}

/**
 * The rows this product PROMISES a working lane for: anything an Expert can
 * actually start (`enabled`) plus anything the registry declares `available`.
 * A `coming_soon` or `partial` row that is not startable is allowed to have no
 * lane — that is the honest, declared state the cards already show.
 */
export function promisesALane(approach: DistillationApproach): boolean {
  return approach.enabled || approach.availability === "available";
}
