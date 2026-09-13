import { useId, useState } from "react";
import type { ContentSource } from "@/features/rich-document/types";
import type { Note } from "./types";
import type { NoteRecord } from "./redux/notes.types";
import { captureNoteEditSourceFromRecord } from "./richDocumentSource";

type Args = { record: NoteRecord; displayedNote: Note; actorId: string; actingSelection?: string } | null;
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("Notes snapshot identity requires serializable state.");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
/** Stable per mounted editor; sequence changes only when complete editor inputs change. */
export function usePreparedNoteContentSource(args: Args): ContentSource | undefined {
  const mountId = useId();
  const sourceId = `notes-editor:${mountId}`;
  // Normalize through the constructor first: Redux-only history/status fields
  // cannot influence an editor snapshot identity.
  const normalized = args === null ? null : captureNoteEditSourceFromRecord({
    record: args.record, displayedNote: args.displayedNote, actorId: args.actorId,
    sourceId, snapshotId: `${sourceId}:pending`, ...(args.actingSelection === undefined ? {} : { actingSelection: args.actingSelection }),
  });
  const signature = normalized === null ? null : canonical({ editBase: normalized.editBase, acknowledgedPhysicalSnapshot: normalized.acknowledgedPhysicalSnapshot, displayedPhysicalSnapshot: normalized.displayedPhysicalSnapshot, actingSelection: normalized.actingSelection ?? null });
  const [state, setState] = useState({ signature, sequence: 0 });
  let sequence = state.sequence;
  if (state.signature !== signature) { sequence += 1; setState({ signature, sequence }); }
  if (args === null) return undefined;
  return captureNoteEditSourceFromRecord({ record: args.record, displayedNote: args.displayedNote, actorId: args.actorId, sourceId, snapshotId: `${sourceId}:${sequence}`, ...(args.actingSelection === undefined ? {} : { actingSelection: args.actingSelection }) });
}
