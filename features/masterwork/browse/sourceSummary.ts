// features/masterwork/browse/sourceSummary.ts
//
// WHAT THIS RULEBOOK WAS BUILT FROM, in one line, for the column called SOURCE.
//
// ## The screen this closed first (cold walk 16, defect F — also walk 15's I
// ## and walk 14's E, unchanged across three walks)
//
// `/masterwork/all` printed `—` under **SOURCE** on all twelve rows read,
// including a Rulebook built forty minutes earlier from one interview and five
// named files. The column READ THE WRONG FIELD: `rulebook.source.author`, a
// bibliographic jsonb blob only the book-import lane ever fills. The
// bibliographic author survives below as the fallback for the rows that
// genuinely have one, so nothing a book import used to show is lost.
//
// ## The screen this closes now (cold walk 18, defect 2 — 2026-09-21)
//
// The dash became a FALSE SENTENCE. Six rows read "Nothing yet" over Rulebooks
// holding a recorded interview and a pasted document; the walker's own
// Rulebook went to five sources in its Sources panel and stayed at
// "1 interview · 3 documents" here.
//
// 🚨 THE RULE THIS FILE USED TO STATE IS OVERTURNED. It said KEPT material
// only — that a source merely ATTACHED "has not built anything, so it is not
// in this sentence". The six silenced Rulebooks had produced up to eighteen
// rules out of exactly that material. The column is headed SOURCE; its
// question is "what was this built from"; both stores answer it. The union is
// taken by IDENTITY in `../sourceTally.ts`, which is also where the nouns and
// the sentence live, so this column, the Rulebook's Sources block
// (`../sourceLinks.ts::tallyOf`) and the "Your words" header
// (`../record/format.ts`) cannot drift apart again.
//
// `../sourceLinks.ts` still owns the GATE ("does this Rulebook have material
// at all"), and now shares this file's arithmetic to answer it.

import {
  formatSourceGroups,
  mediumSentenceWord,
  sourceNounsFor,
  tallySourceGroups,
  INTERVIEW_NOUNS,
  type SourceGroup,
  type TallyableSource,
} from "../sourceTally";
import { MEDIUM_LABELS } from "../kept-sources/columns";
import { entityIdentity, interviewIdentity } from "../sourceIdentity";

export { mediumSentenceWord };
export type { SourceGroup };

/** Kept here under its old name so existing readers are unchanged. */
export const INTERVIEW_GROUP = INTERVIEW_NOUNS;

/** The fields the tally needs off a `platform.masterwork_source` row. */
export interface SourceTallyRow {
  rulebook_id: string;
  approach_key: string | null;
  medium: string;
  /** The platform's one source identity. Absent only on an older read. */
  source_key?: string | null;
}

/**
 * The fields the tally needs off a `platform.associations` edge pointing at a
 * Rulebook — the ATTACHED half, which used to be invisible here.
 *
 * `role` is `distillation_source` (something pointed at) or `interview` (the
 * conversation a sitting happened in). Nothing else is material.
 */
export interface AttachedTallyRow {
  target_id: string;
  role: string;
  source_type: string;
  source_id: string;
}

/** The edge role an ATTACHED source carries. Mirrors `../sourceLinks.ts`. */
export const ATTACHED_ROLES = ["distillation_source", "interview"] as const;

/**
 * What the SOURCE cell knows about one Rulebook.
 *
 * `unavailable` is a real state and it is SAID on screen, never drawn as `—`:
 * the tally read failing is not the same fact as a Rulebook having no sources,
 * and a column that renders both as a dash is the defect this file closes,
 * wearing a different hat (law 4).
 */
export type RulebookSourcesRead =
  | {
      state: "read";
      groups: SourceGroup[];
      total: number;
      /**
       * True when a scan hit its cap, so these counts are a FLOOR. The cell
       * then says so with a `+` rather than printing a number it cannot stand
       * behind.
       */
      partial: boolean;
    }
  | { state: "unavailable" };

/**
 * The words for one kept row's kind. Exported so the guard can prove that
 * every medium the reader knows about has one — a medium added on the server
 * must surface as "source", never as a raw stored word on an Expert's screen.
 */
export function groupWordsFor(row: {
  approach_key: string | null;
  medium: string;
}) {
  return sourceNounsFor({
    sourceKey: "",
    approachKey: row.approach_key,
    medium: row.medium,
  });
}

/** Every medium in `MEDIUM_LABELS` must have a sentence word. Guard reads it. */
export const MEDIUM_LABEL_KEYS = Object.keys(MEDIUM_LABELS);

/**
 * The identity of a kept row.
 *
 * `source_key` IS the identity and is never null in the live table. The
 * fallback is a per-row token rather than an empty string on purpose: a row
 * whose identity we cannot read must still be COUNTED — dropping it would be
 * the undercount this file exists to kill, one layer down.
 */
function keptRowIdentity(row: SourceTallyRow, index: number): string {
  const key = String(row.source_key ?? "").trim();
  return key || `kept-row:${row.rulebook_id}:${index}`;
}

/**
 * The identity of an attached edge, in the platform's own scheme.
 *
 * An interview edge is `interview:<conversation_id>` — the same key
 * `raw_material.keep` stamps on the sitting's kept row — so one interview
 * counts once whether it has been kept yet or not. Everything else is
 * `entityIdentity`, which collapses `entity:file:<id>` to `file:<id>` exactly
 * as the server does, so an upload that has been read counts once too.
 */
function attachedRowIdentity(row: AttachedTallyRow): string {
  if (row.role === "interview") return interviewIdentity(row.source_id);
  return entityIdentity(row.source_type, row.source_id);
}

/**
 * Fold a page's worth of kept rows and attached edges into one read per
 * Rulebook.
 *
 * `rulebookIds` is passed in because a Rulebook with NO material must still
 * get an answer — "read, and there are none" is a fact, and leaving it out of
 * the map would make it indistinguishable from "we never asked".
 */
export function summarizeSources(
  rulebookIds: string[],
  rows: SourceTallyRow[],
  options: {
    partial?: boolean;
    attached?: readonly AttachedTallyRow[];
  } = {},
): Map<string, RulebookSourcesRead> {
  const material = new Map<string, TallyableSource[]>();
  for (const id of rulebookIds) material.set(id, []);

  rows.forEach((row, index) => {
    const bucket = material.get(row.rulebook_id);
    if (!bucket) return; // A row for a Rulebook outside this page.
    bucket.push({
      sourceKey: keptRowIdentity(row, index),
      approachKey: row.approach_key,
      medium: row.medium,
      kept: true,
    });
  });

  for (const edge of options.attached ?? []) {
    const bucket = material.get(edge.target_id);
    if (!bucket) continue;
    if (!(ATTACHED_ROLES as readonly string[]).includes(edge.role)) continue;
    bucket.push({
      sourceKey: attachedRowIdentity(edge),
      entityToken: edge.source_type,
      interview: edge.role === "interview",
    });
  }

  const out = new Map<string, RulebookSourcesRead>();
  for (const [id, items] of material) {
    const { groups, total } = tallySourceGroups(items);
    out.set(id, {
      state: "read",
      groups,
      total,
      partial: options.partial === true,
    });
  }
  return out;
}

/**
 * The sentence itself: "1 interview · 3 documents · 2 notes".
 *
 * Returns null when there is nothing at all — the CELL decides what to draw in
 * that case (the bibliographic author, if this Rulebook is a book import), so
 * this never invents a stand-in sentence.
 */
export function formatSourceSummary(read: RulebookSourcesRead): string | null {
  if (read.state !== "read" || read.total === 0) return null;
  if (read.partial) {
    // A scan stopped before the end, so every number here is a floor and the
    // line says so instead of printing a breakdown it cannot stand behind.
    return `${read.total}+ sources`;
  }
  return formatSourceGroups(read.groups);
}
