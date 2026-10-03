/**
 * The tab's open document models — the app wiring of `./documentModel.ts`.
 *
 * `acquireDocumentModel(id)` is the one door: every `DocumentEditor` holds the
 * model of its document for as long as it is mounted, and every side effect a
 * document owns (the save, the snapshot channel, the collab room, the page-hide
 * flush) runs once per document here — never once per editor.
 */
"use client";

import type { RealtimeManager } from "@ai-matrx/realtime";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { supabase } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { openShared } from "@/lib/realtime/sharedChannel";
import { toast } from "@/components/ui/use-toast";
import { getLatestDocumentSnapshot, saveDocumentSnapshot } from "../document-service";
import { isServiceFailure } from "../types";
import { documentSessionChanged, documentSessionClosed } from "../redux/documentSessionsSlice";
import {
  createDocumentModelRegistry,
  type DocumentModel,
  type DocumentModelDeps,
  type DocumentSnapshotData,
} from "./documentModel";

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
  reportStatus(documentId, patch) {
    const store = getStoreSingleton();
    if (!store) return;
    store.dispatch(patch ? documentSessionChanged({ id: documentId, patch }) : documentSessionClosed(documentId));
  },
  onSaveFailed(_documentId, message) {
    toast({ title: "Could not save document", description: message, variant: "destructive" });
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

const registry = createDocumentModelRegistry(deps);

/** Hold a document's model; call `release` when the editor unmounts. */
export function acquireDocumentModel(documentId: string): { model: DocumentModel; release: () => void } {
  const handle = registry.acquire(documentId);
  return { model: handle.session, release: handle.release };
}

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

/** Test / diagnostics seam: the ids with a live model in this tab. */
export function openDocumentModelIds(): string[] {
  return registry.ids();
}
