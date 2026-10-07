/**
 * Cloud documents on THE one working-copy primitive — kind `udt_document`
 * (`lib/working-copy/workingCopyKind.ts`). The record's status / dirty / views
 * are Redux (`workingCopies["udt_document:<id>"]`); its engine is the
 * `DocumentModel` (`./documentModel.ts`) registered on the record's session.
 *
 * `documentWorkingCopy.attach(id, store)` is the one door: every
 * `DocumentEditor` holds its document for as long as it is mounted, and every
 * side effect a document owns (the one save, the snapshot channel, the collab
 * room, the page-hide flush) runs once per document — never once per editor.
 */
"use client";

import type { RealtimeManager } from "@ai-matrx/realtime";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { supabase } from "@/utils/supabase/client";
import { defineWorkingCopyKind } from "@/lib/working-copy/workingCopyKind";
import { announceWorkingCopyConflict, dismissWorkingCopyConflict } from "@/lib/working-copy/announce";
import { openShared } from "@/lib/realtime/sharedChannel";
import { toast } from "@/components/ui/use-toast";
import { getLatestDocumentSnapshot, saveDocumentSnapshot } from "@/features/documents/document-service";
import { isServiceFailure } from "@/features/data-tables/types";
import {
  DOCUMENT_SAVE_DELAY_MS,
  DocumentModel,
  type DocumentModelDeps,
  type DocumentSnapshotData,
} from "@/features/documents/document-model/documentModel";

/** One place names this channel. A second, different declaration throws. */
const documentSnapshotsChannel = defineChannelNamespace({
  namespace: "udt-document-snapshots",
  parts: ["documentId"],
  description: "workbench.udt_document_snapshots inserts for one document",
});

type SnapshotRow = { id?: string };

const deps: DocumentModelDeps = {
  async loadLatest(documentId) {
    const res = await getLatestDocumentSnapshot(documentId);
    if (isServiceFailure(res)) throw new Error(res.error);
    if (!res.data) return null;
    return { id: res.data.id, snapshot: res.data.snapshot as DocumentSnapshotData };
  },
  async save({ documentId, snapshot, origin }) {
    const res = await saveDocumentSnapshot({ documentId, snapshot, origin });
    if (isServiceFailure(res)) throw new Error(res.error);
    // component-created-by-ok: append-only snapshot with NO updated_by column and NO parent-rewrite trigger — created_by is the author the client wrote at insert (the only person field this table has)
    return { id: res.data.id, createdBy: res.data.created_by ?? null };
  },
  onSaved(_documentId, origin) {
    if (origin === "manual") toast({ title: "Snapshot saved", variant: "success" });
  },
  listenToPage({ flush, hasUnsaved }) {
    // TYPED WORK NEVER LEAVES THE PAGE UNWRITTEN: a reload / tab switch /
    // close flushes the pending save at once, and warns if one is still
    // unwritten (a flush is a request, not a guarantee). Once per document.
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return;
      flush();
      event.preventDefault();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  },
};

/**
 * How long a document stays in memory after its last view leaves (and its save
 * lands): a board tile waking, a removed tile undone or Back and forward within
 * this reads nothing again — not the row, not the body. Its snapshot channel
 * stays open meanwhile, so a collaborator's save still arrives.
 */
const DOCUMENT_KEEP_ALIVE_MS = 5 * 60_000;

export const documentWorkingCopy = defineWorkingCopyKind<DocumentModel>({
  entity: "udt_document",
  delay: () => DOCUMENT_SAVE_DELAY_MS,
  keepAliveMs: DOCUMENT_KEEP_ALIVE_MS,
  createEngine: (handle) => new DocumentModel(handle, deps),
  firstViewArrived: (model) => model?.wake(),
  lastViewGone: (model) => model?.rest(),
  engineBusy: (model) => model.hasViews(),
  close: (model) => model?.close(),
  async save({ engine, reason }) {
    if (!engine) throw new Error("The document is not open in this tab.");
    const wrote = await engine.write(reason);
    // A collab peer's edits are the host's to write: nothing to show as saved.
    return { savedAt: wrote ? Date.now() : null };
  },
  onSaveFailed(_id, message, _reason, failure) {
    // The primitive retries a transient failure: say it once per streak, and
    // again when it is final (permission / conflict — the person decides).
    if (!failure.permanent && failure.attempts > 1) return;
    toast({
      title: failure.permanent ? "Could not save document" : "Could not save document — retrying",
      description: message,
      variant: "destructive",
    });
  },
  // A collaborator saved over the base of this tab's unsaved edits.
  onConflict: (id, conflict) => announceWorkingCopyConflict(documentWorkingCopy, id, "Document", conflict),
  onConflictResolved: (id) => dismissWorkingCopyConflict(documentWorkingCopy, id),
  async resolveConflict(model, choice, conflict) {
    // Keep mine: the next save writes this tab's document on top. Take theirs:
    // every view (and a kept editor) shows the newest stored snapshot.
    if (choice === "theirs" && model) {
      await model.onRemoteSnapshot(conflict.theirsRef ?? "", { overUnsaved: true });
    }
  },
});

/**
 * Open the document's snapshot-insert channel once (shared by every view).
 * A collaborator's committed snapshot reaches every view of the document;
 * `onBackfill` re-reads the newest so a reconnect or tab wake cannot leave
 * this tab working from a base that moved while it was away.
 */
export function connectDocumentRealtime(model: DocumentModel, manager: RealtimeManager): void {
  const documentId = model.documentId;
  model.connectRealtime((onSnapshot) => {
    const topic = documentSnapshotsChannel.topic({ documentId });
    return openShared(manager, topic, () => ({
      topic,
      postgresChanges: [
        {
          event: "INSERT",
          schema: "workbench",
          table: "udt_document_snapshots",
          filter: `document_id=eq.${documentId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          onChange: ({ row }) => {
            const snapshotRow = row as SnapshotRow | null;
            if (snapshotRow?.id) onSnapshot(snapshotRow.id);
          },
        },
      ],
      onBackfill: async () => {
        const { data, error } = await supabase
          .schema("workbench")
          .from("udt_document_snapshots")
          .select("id")
          .eq("document_id", documentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn(
            "[udt-document RT] catch-up read failed — this document may be working from a stale snapshot base; reload before saving.",
            error.message,
          );
          return;
        }
        const latest = data as SnapshotRow | null;
        if (latest?.id) onSnapshot(latest.id);
      },
    }));
  });
}

/** Test / diagnostics seam: the ids with a live document session in this tab. */
export function openDocumentModelIds(): string[] {
  return documentWorkingCopy.openIds();
}
