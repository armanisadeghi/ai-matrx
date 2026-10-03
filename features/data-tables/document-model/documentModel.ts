/**
 * THE DOCUMENT MODEL — one in-memory model per cloud document per tab.
 *
 * Before this, the document lived only inside each `DocumentEditor`'s Univer
 * instance. A remount (a board tile waking, a tile removed and undone, a route
 * change and back) rebuilt the editor from the SERVER copy, so whatever the
 * last save had not carried yet was gone; two mounts of one document were two
 * editors, each saving full snapshots of its own copy (last write wins), each
 * with its own realtime channel and its own collab room.
 *
 * Now every `DocumentEditor` is a VIEW of this model:
 *
 *  - BODY. Univer owns the body (its snapshot and command stream). Every local
 *    mutation in one view is replayed into every other view of the document
 *    (the same mutation stream collab sends between machines), so two views
 *    show one document. A new view boots from the model's latest state — a
 *    live view's snapshot, or the snapshot the last view left behind — never
 *    the stale server copy while the model is alive.
 *  - SAVE. ONE coalesced, serialized save per document
 *    (`lib/working-copy/coalescedCommit.ts`), never one per view. The last view
 *    leaving flushes it; the model stays alive until that save lands, and a
 *    view that comes back meanwhile re-attaches to it.
 *  - SIDE EFFECTS, ONCE. The snapshot realtime channel, the collab room, and
 *    the pagehide / visibility / beforeunload flush are opened once per
 *    document and closed once (`lib/working-copy/recordSessions.ts`).
 *  - STATUS. Save status lives in Redux (`documentSessions`, keyed by id), so
 *    every view shows one status.
 */

import type { ICommandInfo, IDocumentData } from "@univerjs/core";
import { createCoalescedCommit, type CommitReason } from "@/lib/working-copy/coalescedCommit";
import { createRecordSessionRegistry } from "@/lib/working-copy/recordSessions";
import type { DocumentSaveStatus, DocumentSessionMeta } from "../redux/documentSessionsSlice";
import type { AwarenessState } from "../collab/types";
import { isSnapshotMutation } from "../utils/isSnapshotMutation";
import type {
  CollabMutationInfo,
  CommandServiceLike,
} from "../collab/WorkbookCollabSession";

/** Debounce from the last edit to the save. */
export const DOCUMENT_SAVE_DELAY_MS = 2500;

export type DocumentSnapshotData = Partial<IDocumentData>;

/** What a view lends the model while it is mounted. */
export interface DocumentViewPort {
  /** Univer's command service for this view's instance. */
  commandService: CommandServiceLike;
  /** The live document of this view (`doc.save()`), or null if it has none. */
  snapshot: () => DocumentSnapshotData | null;
  /** Replace the whole document in this view (a collaborator's snapshot). */
  remount: (snapshot: DocumentSnapshotData) => void;
  /** Whether this view may change the document (read at edit time). */
  editable: () => boolean;
}

/** Everything the model reaches outside itself — injected so it is testable. */
export interface DocumentModelDeps {
  /** The newest stored snapshot (its row id + body), or null for a document never saved. */
  loadLatest: (documentId: string) => Promise<{ id: string; snapshot: DocumentSnapshotData } | null>;
  save: (input: {
    documentId: string;
    snapshot: DocumentSnapshotData;
    origin: "autosave" | "manual";
  }) => Promise<{ id: string; createdBy: string | null }>;
  reportStatus: (documentId: string, patch: Partial<DocumentSessionMeta> | null) => void;
  onSaveFailed: (documentId: string, message: string) => void;
  onSaved?: (documentId: string, origin: "autosave" | "manual") => void;
  /** Window-level listeners (pagehide, visibilitychange, beforeunload). */
  listenToPage?: (handlers: { flush: () => void; hasUnsaved: () => boolean }) => () => void;
}

interface AttachedView {
  id: number;
  port: DocumentViewPort;
  dispose: () => void;
}

/** A collab room (WorkbookCollabSession) bound to the model's command stream. */
export interface DocumentCollabHandle {
  stop: () => void;
  isHost: () => boolean;
}

/** Who else is in the document's room (shared by every view of it). */
export interface DocumentAwareness {
  states: Map<number, AwarenessState>;
  selfUid: string;
}

export type DocumentCollabFactory = (
  commandService: CommandServiceLike,
  onAwareness: (awareness: DocumentAwareness) => void,
) => Promise<DocumentCollabHandle | null>;

let viewIds = 0;

export class DocumentModel {
  readonly documentId: string;
  private readonly deps: DocumentModelDeps;
  private readonly views = new Map<number, AttachedView>();
  private lastEditedView: number | null = null;
  /** The document as the last view left it, or as last loaded / saved. */
  private stored: DocumentSnapshotData | null = null;
  private loading: Promise<DocumentSnapshotData | null> | null = null;
  private relaying = false;
  private status: DocumentSaveStatus = "idle";
  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  /** Snapshot rows this tab already holds (loaded or written) — never re-applied. */
  private readonly knownSnapshots = new Set<string>();
  private readonly collabListeners = new Set<(info: CollabMutationInfo) => void>();
  private collab: DocumentCollabHandle | null = null;
  private collabStarting: Promise<void> | null = null;
  private awareness: DocumentAwareness | null = null;
  private readonly awarenessListeners = new Set<() => void>();
  private realtimeClose: (() => void) | null = null;
  private pageClose: (() => void) | null = null;
  private readonly commit;

  constructor(documentId: string, deps: DocumentModelDeps) {
    this.documentId = documentId;
    this.deps = deps;
    this.commit = createCoalescedCommit<DocumentSnapshotData | null>({
      delay: () => DOCUMENT_SAVE_DELAY_MS,
      read: () => this.latest(),
      run: (snapshot, reason) => this.write(snapshot, reason),
      onError: (error) =>
        console.error(`[document-model] saving ${documentId} failed — the edit stays pending`, error),
    });
  }

  // ── body ────────────────────────────────────────────────────────────────

  /** The newest state of the body this tab holds, without a network read. */
  latest(): DocumentSnapshotData | null {
    const preferred = this.lastEditedView !== null ? this.views.get(this.lastEditedView) : undefined;
    for (const view of preferred ? [preferred, ...this.views.values()] : this.views.values()) {
      try {
        const snapshot = view.port.snapshot();
        if (snapshot) return snapshot;
      } catch (error) {
        console.warn(`[document-model] a view of ${this.documentId} could not report its document`, error);
      }
    }
    return this.stored;
  }

  /**
   * What a NEW view should boot from: the model's latest state, or (only when
   * this tab holds none) the newest server snapshot. Null = an empty document.
   * Re-read `latest()` synchronously right before mounting — another view may
   * have typed while the server read was in flight.
   */
  async openingSnapshot(createEmpty: () => DocumentSnapshotData): Promise<DocumentSnapshotData> {
    const held = this.latest();
    if (held) return held;
    if (!this.loading) {
      this.loading = this.deps.loadLatest(this.documentId).then(
        (row) => {
          if (row) this.knownSnapshots.add(row.id);
          // A document never saved opens as ONE empty document for every view
          // (one unit id), so their edits replay into each other.
          if (!this.stored) this.stored = row ? row.snapshot : createEmpty();
          return this.latest() ?? this.stored;
        },
        (error: unknown) => {
          this.loading = null;
          throw error;
        },
      );
    }
    return (await this.loading) ?? createEmpty();
  }

  /** A view's Univer instance is ready: it shares the document from now on. */
  attachView(port: DocumentViewPort): () => void {
    const id = ++viewIds;
    const subscription = port.commandService.onMutationExecutedForCollab((info, options) =>
      this.onViewMutation(id, info, options),
    );
    this.views.set(id, { id, port, dispose: () => subscription.dispose() });
    this.report({ views: this.views.size });
    let detached = false;
    return () => {
      if (detached) return;
      detached = true;
      const view = this.views.get(id);
      if (!view) return;
      // Whatever this view shows is the newest body when it is the last one:
      // keep it, so a remount (or the flush on the way out) reads it.
      if (this.views.size === 1) {
        try {
          const snapshot = port.snapshot();
          if (snapshot) this.stored = snapshot;
        } catch (error) {
          console.warn(`[document-model] could not keep ${this.documentId}'s last view's document`, error);
        }
      }
      view.dispose();
      this.views.delete(id);
      if (this.lastEditedView === id) this.lastEditedView = null;
      this.report({ views: this.views.size });
    };
  }

  private onViewMutation(
    viewId: number,
    info: Readonly<CollabMutationInfo>,
    options?: { fromCollab?: boolean; fromChangeset?: boolean; onlyLocal?: boolean },
  ): void {
    // Our own replay into this view, a collab peer's edit, or a load: not a
    // new local edit (each is accounted where it came from).
    if (this.relaying || options?.fromCollab || options?.fromChangeset) return;
    const view = this.views.get(viewId);
    if (!view || !view.port.editable()) return;
    this.lastEditedView = viewId;
    this.relay(info, viewId);
    for (const listener of this.collabListeners) listener(info as CollabMutationInfo);
    if (isContentMutation(info)) this.markDirty();
  }

  /** Replay one mutation into every view except `exceptViewId`. */
  private relay(info: Readonly<CollabMutationInfo>, exceptViewId: number | null): void {
    if (this.views.size === 0 || (this.views.size === 1 && exceptViewId !== null)) return;
    this.relaying = true;
    try {
      for (const view of this.views.values()) {
        if (view.id === exceptViewId) continue;
        try {
          view.port.commandService.syncExecuteCommand(info.id, info.params, { onlyLocal: true, fromCollab: true });
        } catch (error) {
          console.error(
            `[document-model] a second view of ${this.documentId} could not apply "${info.id}" — it may show an older document until it reopens`,
            error,
          );
        }
      }
    } finally {
      this.relaying = false;
    }
  }

  // ── save ────────────────────────────────────────────────────────────────

  private markDirty(): void {
    this.setStatus("dirty");
    this.commit.schedule();
  }

  private async write(snapshot: DocumentSnapshotData | null, reason: CommitReason): Promise<void> {
    if (!snapshot) throw new Error("There is no open document to save.");
    // Collab: the elected host writes the canonical snapshot; a peer's edits
    // reach it through the room. An explicit Save always writes.
    if (this.collab && !this.collab.isHost() && reason !== "manual") {
      this.setStatus("idle");
      return;
    }
    const origin = reason === "manual" ? "manual" : "autosave";
    this.setStatus("saving");
    try {
      const { id } = await this.deps.save({ documentId: this.documentId, snapshot, origin });
      this.knownSnapshots.add(id);
    } catch (error) {
      this.setStatus("error");
      this.deps.onSaveFailed(this.documentId, error instanceof Error ? error.message : String(error));
      throw error;
    }
    if (this.views.size === 0) this.stored = snapshot;
    this.setStatus(this.commit.hasPending() ? "dirty" : "saved", { lastSavedAt: new Date().toISOString() });
    this.deps.onSaved?.(this.documentId, origin);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => {
      this.savedTimer = null;
      if (this.status === "saved") this.setStatus("idle");
    }, 1500);
  }

  /** Save now (the toolbar's Save): a labeled snapshot even with nothing pending. */
  saveNow(): Promise<void> {
    return this.commit.flush("manual", true);
  }

  /** Write pending edits now (page hide, last view gone). */
  flush(): Promise<void> {
    return this.commit.flush("flush");
  }

  hasUnsaved(): boolean {
    return this.commit.hasPending() || this.commit.isBusy();
  }

  // ── realtime (snapshot inserts) ─────────────────────────────────────────

  /** Opened once per document by the first view that asks; idempotent. */
  connectRealtime(open: (onSnapshot: (snapshotId: string) => void) => () => void): void {
    if (this.realtimeClose) return;
    this.realtimeClose = open((snapshotId) => void this.onRemoteSnapshot(snapshotId));
  }

  /** A snapshot was committed (here or elsewhere): show a foreign one in every view, unless we have unsaved edits. */
  async onRemoteSnapshot(snapshotId: string): Promise<void> {
    if (this.collab) return; // the room is the live channel; snapshots are checkpoints
    if (this.knownSnapshots.has(snapshotId)) return; // ours, or already shown
    if (this.commit.isBusy()) return; // our own save's echo, ahead of its response
    if (this.hasUnsaved()) {
      console.warn(
        `[document-model] ${this.documentId} changed elsewhere while this tab has unsaved edits — keeping this tab's edits; the next save writes them`,
      );
      return;
    }
    const row = await this.deps.loadLatest(this.documentId);
    if (!row || this.hasUnsaved() || this.knownSnapshots.has(row.id)) return;
    this.knownSnapshots.add(row.id);
    this.stored = row.snapshot;
    this.relaying = true;
    try {
      for (const view of this.views.values()) view.port.remount(row.snapshot);
    } finally {
      this.relaying = false;
    }
  }

  // ── collab (one room per document) ──────────────────────────────────────

  /**
   * The model's command stream as ONE command service — what the collab room
   * binds to. Local edits from any view go out once; a peer's edit is applied
   * to every view.
   */
  private readonly virtualCommandService: CommandServiceLike = {
    onMutationExecutedForCollab: (listener) => {
      this.collabListeners.add(listener);
      return { dispose: () => this.collabListeners.delete(listener) };
    },
    syncExecuteCommand: (id, params) => {
      const info = { id, type: 2, params } as CollabMutationInfo;
      this.relay(info, null);
      // The host writes what peers typed.
      if (isContentMutation(info)) this.markDirty();
      return true;
    },
  };

  /** Join the document's collab room once (the first view that asks). */
  startCollab(factory: DocumentCollabFactory): Promise<void> {
    if (this.collab) return Promise.resolve();
    if (!this.collabStarting) {
      this.collabStarting = factory(this.virtualCommandService, (awareness) => {
        this.awareness = awareness;
        for (const listener of Array.from(this.awarenessListeners)) listener();
      })
        .then((handle) => {
          if (!handle) return;
          if (this.views.size === 0) {
            handle.stop();
            return;
          }
          this.collab = handle;
        })
        .finally(() => {
          this.collabStarting = null;
        });
    }
    return this.collabStarting;
  }

  isCollabHost(): boolean {
    return this.collab ? this.collab.isHost() : true;
  }

  getAwareness(): DocumentAwareness | null {
    return this.awareness;
  }

  subscribeAwareness(listener: () => void): () => void {
    this.awarenessListeners.add(listener);
    return () => this.awarenessListeners.delete(listener);
  }

  // ── lifecycle (driven by the registry) ──────────────────────────────────

  /** A view arrived on a model with none. */
  wake(): void {
    if (!this.pageClose && this.deps.listenToPage) {
      this.pageClose = this.deps.listenToPage({
        flush: () => void this.flush(),
        hasUnsaved: () => this.hasUnsaved(),
      });
    }
  }

  /** The last view left: leave the rooms, write what it held. */
  rest(): Promise<void> {
    this.collab?.stop();
    this.collab = null;
    this.awareness = null;
    this.realtimeClose?.();
    this.realtimeClose = null;
    return this.flush();
  }

  canDrop(): boolean {
    return this.views.size === 0 && !this.hasUnsaved();
  }

  close(): void {
    this.pageClose?.();
    this.pageClose = null;
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.commit.cancel();
    this.deps.reportStatus(this.documentId, null);
  }

  private setStatus(status: DocumentSaveStatus, extra?: Partial<DocumentSessionMeta>): void {
    this.status = status;
    this.report({ saveStatus: status, ...extra });
  }

  private report(patch: Partial<DocumentSessionMeta>): void {
    this.deps.reportStatus(this.documentId, patch);
  }
}

/** Mutations that change what a snapshot stores (never scroll / selection) — the editors' one dirty filter. */
function isContentMutation(info: Readonly<CollabMutationInfo>): boolean {
  return isSnapshotMutation({ id: info.id, type: info.type, params: info.params } as ICommandInfo);
}

/** The registry of open document models for one tab, given its dependencies. */
export function createDocumentModelRegistry(deps: DocumentModelDeps) {
  const registry = createRecordSessionRegistry<DocumentModel>({
    open: (id) => new DocumentModel(id, deps),
    firstViewArrived: (model) => model.wake(),
    lastViewGone: (model) => model.rest(),
    canDrop: (model) => model.canDrop(),
    close: (model) => model.close(),
  });
  return registry;
}
