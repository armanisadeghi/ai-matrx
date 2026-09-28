/**
 * The three reads a picked Google file offers — ONE implementation, four doors.
 *
 * "Read comments", "Read history" and "Read speaker notes" are reachable from
 * the bulk bar, the row ⋮ menu, the right-click menu and an agent's write
 * target. Every door runs THIS function, so a refusal reads the same and a fix
 * lands everywhere at once.
 *
 * A read that has nothing to act on is a REFUSAL, returned as a sentence —
 * never thrown as a failure and never dressed as a success. The caller shows it
 * as information and keeps the person's selection.
 */

import { FileText, History, Presentation, type LucideIcon } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import {
  readGoogleComments,
  readGooglePresentation,
  readGoogleRevisions,
} from "../api";
import type { ConnectedSourceRow } from "../types";
import type { ConnectedReadResult } from "../components/ReadResultsDialog";

export type SourceReadKind = ConnectedReadResult["kind"];

export interface SourceReadSpec {
  kind: SourceReadKind;
  label: string;
  icon: LucideIcon;
  /** Can this row be read this way at all? */
  eligible: (row: ConnectedSourceRow) => boolean;
  /** What to say when nothing chosen can be read this way. */
  refusal: string;
}

function connectionIdOf(row: ConnectedSourceRow): string | null {
  const value = row.attributes.connection_id;
  return typeof value === "string" && value ? value : null;
}

function readsExpertSignal(row: ConnectedSourceRow): boolean {
  return row.attributes.reads_comments === true && connectionIdOf(row) !== null;
}

export const SOURCE_READS: readonly SourceReadSpec[] = [
  {
    kind: "comments",
    label: "Read comments",
    icon: FileText,
    eligible: readsExpertSignal,
    refusal:
      "Comments are read from Google Docs, Sheets and Slides you picked, and none of the chosen items is one.",
  },
  {
    kind: "revisions",
    label: "Read history",
    icon: History,
    eligible: (row) => row.attributes.reads_revisions === true && connectionIdOf(row) !== null,
    refusal:
      "Revision history is read from Google Docs, Sheets and Slides you picked, and none of the chosen items is one.",
  },
  {
    kind: "slides",
    label: "Read speaker notes",
    icon: Presentation,
    eligible: (row) =>
      row.attributes.reads_speaker_notes === true && connectionIdOf(row) !== null,
    refusal:
      "Speaker notes live on a Google Slides deck you picked, and none of the chosen items is one.",
  },
];

export function sourceReadSpec(kind: SourceReadKind): SourceReadSpec {
  const spec = SOURCE_READS.find((candidate) => candidate.kind === kind);
  if (!spec) throw new Error(`Unknown read: ${kind}`);
  return spec;
}

export type SourceReadOutcome =
  | { ok: true; result: ConnectedReadResult; skipped: number }
  | { ok: false; refusal: string };

/**
 * Read every eligible row, in order. Rows that cannot be read this way are
 * skipped and counted (never silently dropped from the answer); when none can
 * be read the answer is the refusal sentence. A server failure THROWS with the
 * server's own sentence.
 */
export async function runSourceRead(
  dispatch: AppDispatch,
  kind: SourceReadKind,
  rows: readonly ConnectedSourceRow[],
  /** Called once the read is known to run — open the pending dialog here. */
  onStart?: (titles: string[]) => void,
): Promise<SourceReadOutcome> {
  const spec = sourceReadSpec(kind);
  const eligible = rows.filter(spec.eligible);
  if (!eligible.length) return { ok: false, refusal: spec.refusal };
  onStart?.(eligible.map((row) => row.title));
  const skipped = rows.length - eligible.length;
  const ref = (row: ConnectedSourceRow) => ({ title: row.title, url: row.url ?? null });

  if (kind === "comments") {
    const files = [];
    for (const row of eligible) {
      const thread = await readGoogleComments(dispatch, connectionIdOf(row) ?? "", row.external_id);
      files.push({ ...ref(row), thread });
    }
    return { ok: true, result: { kind, files }, skipped };
  }
  if (kind === "revisions") {
    const files = [];
    for (const row of eligible) {
      const history = await readGoogleRevisions(dispatch, connectionIdOf(row) ?? "", row.external_id);
      files.push({ ...ref(row), history });
    }
    return { ok: true, result: { kind, files }, skipped };
  }
  const files = [];
  for (const row of eligible) {
    const deck = await readGooglePresentation(dispatch, connectionIdOf(row) ?? "", row.external_id);
    files.push({ ...ref(row), deck });
  }
  return { ok: true, result: { kind, files }, skipped };
}
