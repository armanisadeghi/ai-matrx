// features/rich-document/annotations/sourceSave.ts
//
// THE ONE SAVE ADAPTER an annotation source uses to accept a suggestion, whatever store holds
// its text (a content.document, a Notes note, …). Every store gets the same three guarantees:
//   1. a SPLICE — `spliceProposal` (@ai-matrx/content-ir/source spliceSave, integrity on): only
//      the block(s) the edit touches change; a protected island the edit did not name refuses
//      the save instead of being damaged;
//   2. compare-and-swap on the row's `version` through `guardedUpdate`, retried only on a bump
//      that left the body exactly as this edit's base (a phantom, never somebody's text);
//   3. a plain sentence for a conflict or a missing row.
// A store supplies only how to write a body at a version and how to read the current row.

import { guardedUpdate } from "@ai-matrx/data/db";
import { spliceProposal } from "@/features/rich-document/review/proposedEdit";
import { supabase } from "@/utils/supabase/client";

export interface VersionedBodyRow {
  version: number;
  body: string;
}

export interface VersionedBodyStore {
  /** Write `body` at `nextVersion` only while the row is at `expectedVersion`. */
  write(body: string, expectedVersion: number, nextVersion: number): PromiseLike<{ data: VersionedBodyRow | null; error: unknown }>;
  /** The row as it is now (null when gone or unreadable). */
  current(): PromiseLike<{ data: VersionedBodyRow | null; error: unknown }>;
  /** What the person calls this thing, for the sentences ("document", "note"). */
  noun: string;
}

export async function spliceSaveBody(base: VersionedBodyRow, nextBody: string, store: VersionedBodyStore): Promise<void> {
  const splice = spliceProposal(base.body, nextBody);
  if (!splice) return;
  const result = await guardedUpdate<VersionedBodyRow>({
    expectedVersion: base.version,
    applyUpdate: ({ expectedVersion, nextVersion }) => store.write(splice.text, expectedVersion, nextVersion) as never,
    fetchCurrent: () => store.current() as never,
    rebase: { isPhantom: (current) => current.body === base.body },
  });
  if (result.status === "conflict") {
    throw new Error(`Someone else changed this ${store.noun} since you opened it. Reload to see their version, then apply again.`);
  }
  if (result.status === "not_found") throw new Error(`This ${store.noun} no longer exists or you can no longer edit it.`);
}

/** A Notes note's text (workbench.notes.content), for the same adapter. */
export function noteBodyStore(noteId: string): VersionedBodyStore {
  const asRow = (r: { version: number; content: string | null } | null) => (r ? { version: r.version, body: r.content ?? "" } : null);
  return {
    noun: "note",
    write: (body, expectedVersion, nextVersion) =>
      supabase.schema("workbench").from("notes")
        .update({ content: body, version: nextVersion })
        .eq("id", noteId).eq("version", expectedVersion).is("deleted_at", null)
        .select("version, content").maybeSingle()
        .then(({ data, error }) => ({ data: asRow(data), error })),
    current: () =>
      supabase.schema("workbench").from("notes")
        .select("version, content").eq("id", noteId).is("deleted_at", null).maybeSingle()
        .then(({ data, error }) => ({ data: asRow(data), error })),
  };
}

/** A content.document's body, for the same adapter. */
export function documentBodyStore(documentId: string): VersionedBodyStore {
  return {
    noun: "document",
    write: (body, expectedVersion, nextVersion) =>
      supabase.schema("content").from("document")
        .update({ body, version: nextVersion })
        .eq("id", documentId).eq("version", expectedVersion)
        .select("version, body").maybeSingle(),
    current: () => supabase.schema("content").from("document").select("version, body").eq("id", documentId).maybeSingle(),
  };
}
