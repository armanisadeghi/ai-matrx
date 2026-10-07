/**
 * THE DOCUMENT MODEL — the engine of one cloud document per tab.
 *
 * Before this, the document lived only inside each `DocumentEditor`'s Univer
 * instance. A remount (a board tile waking, a tile removed and undone, a route
 * change and back) rebuilt the editor from the SERVER copy, so whatever the
 * last save had not carried yet was gone; two mounts of one document were two
 * editors, each saving full snapshots of its own copy (last write wins), each
 * with its own realtime channel and its own collab room.
 *
 * The document is a record on THE one working-copy primitive
 * (`lib/working-copy/workingCopyKind.ts`, kind `udt_document`,
 * `./documentModels.ts`): its save status, dirty and view count are Redux state
 * (`workingCopies["udt_document:<id>"]`), its one coalesced save is the kind's.
 * What Redux cannot hold — Univer's body — is this engine, registered on the
 * record's session under the same key:
 *
 *  - BODY. Every local mutation in one view is replayed into every other view
 *    of the document (the same mutation stream collab sends between machines),
 *    so two views show one document. A new view boots from the engine's latest
 *    state — a live view's snapshot, or the snapshot the last view left behind
 *    — never the stale server copy while the record's session is alive.
 *  - SIDE EFFECTS, ONCE. The snapshot realtime channel, the collab room, and
 *    the pagehide / visibility / beforeunload flush are opened once per
 *    document and closed once.
 *  - THE EDITOR ITSELF, KEPT. Univer keeps its undo / redo history inside the
 *    editor instance, so rebuilding the editor on a remount threw the history
 *    away. When the last view leaves, its editor (a Univer instance with its
 *    own DOM host) is parked here — off the page, alive — and the next view of
 *    the document RE-ATTACHES that same instance to its own container instead
 *    of booting a new one (`parkEditor` / `takeParkedEditor`). Undo and redo
 *    therefore work across hide / show, a remount and a removed tile undone,
 *    for as long as the record's session is warm; `close()` disposes it.
 */

import type { ICommandInfo, IDocumentData } from "@univerjs/core";
import type { CommitReason } from "@/lib/working-copy/coalescedCommit";
import type { WorkingCopyHandle } from "@/lib/working-copy/workingCopyKind";
import type { AwarenessState } from "@/lib/collab/types";
import { isSnapshotMutation } from "@/lib/univer/isSnapshotMutation";
import type {
  CollabMutationInfo,
  CommandServiceLike,
} from "@/features/workbooks/collab/WorkbookCollabSession";

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

/** Everything the engine reaches outside itself — injected so it is testable. */
export interface DocumentModelDeps {
  /** The newest stored snapshot (its row id + body), or null for a document never saved. */
  loadLatest: (documentId: string) => Promise<{ id: string; snapshot: DocumentSnapshotData } | null>;
  save: (input: {
    documentId: string;
    snapshot: DocumentSnapshotData;
    origin: "autosave" | "manual";
  }) => Promise<{ id: string; createdBy: string | null }>;
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

/**
 * An editor instance kept alive between views of the document: its DOM host
 * (re-parented into the next view's container) and the instance behind it,
 * whose undo history survives because the instance does. Opaque to the model
 * apart from what it calls.
 */
export interface ParkedDocumentEditor<T = unknown> {
  /** The element the editor renders into; the next view appends it to its container. */
  element: HTMLElement;
  instance: T;
  /** Replace the whole document (a collaborator's snapshot arrived while parked). */
  remount: (snapshot: DocumentSnapshotData) => void;
  /** Throw the instance away (the record's session closed). */
  dispose: () => void;
}

export type DocumentCollabFactory = (
  commandService: CommandServiceLike,
  onAwareness: (awareness: DocumentAwareness) => void,
) => Promise<DocumentCollabHandle | null>;

let viewIds = 0;

export class DocumentModel {
  readonly documentId: string;
  private readonly deps: DocumentModelDeps;
  private readonly handle: WorkingCopyHandle;
  private readonly views = new Map<number, AttachedView>();
  private lastEditedView: number | null = null;
  /** The document as the last view left it, or as last loaded / saved. */
  private stored: DocumentSnapshotData | null = null;
  private loading: Promise<DocumentSnapshotData | null> | null = null;
  private relaying = false;
  /** Snapshot rows this tab already holds (loaded or written) — never re-applied. */
  private readonly knownSnapshots = new Set<string>();
  private readonly collabListeners = new Set<(info: CollabMutationInfo) => void>();
  private collab: DocumentCollabHandle | null = null;
  private collabStarting: Promise<void> | null = null;
  private awareness: DocumentAwareness | null = null;
  private readonly awarenessListeners = new Set<() => void>();
  private realtimeClose: (() => void) | null = null;
  private pageClose: (() => void) | null = null;
  /** The last view's editor, alive and off the page until a view takes it back. */
  private parked: ParkedDocumentEditor | null = null;

  constructor(handle: WorkingCopyHandle, deps: DocumentModelDeps) {
    this.documentId = handle.id;
    this.handle = handle;
    this.deps = deps;
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
          if (row) {
            this.knownSnapshots.add(row.id);
            this.savedFingerprint = contentFingerprint(row.snapshot);
          }
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
    // Nothing unsaved: what this view mounted IS the saved version (Univer and
    // the snapshot repair may restate it — page geometry, defaults — without
    // anyone changing a word). That is the baseline a save compares against.
    if (!this.handle.hasPending()) {
      try {
        const mounted = port.snapshot();
        if (mounted) this.savedFingerprint = contentFingerprint(mounted);
      } catch (error) {
        console.warn(`[document-model] could not read ${this.documentId}'s mounted document`, error);
      }
    }
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
    };
  }

  /**
   * The last view of the document is leaving: keep its editor (and Univer's
   * undo history inside it) for the next view. Call AFTER the view's
   * `attachView` detach. Refused — the caller disposes its editor — while
   * another view is still attached (it carries the document) or one is
   * already kept.
   */
  parkEditor(editor: ParkedDocumentEditor): boolean {
    if (this.closed || this.views.size > 0 || this.parked) return false;
    this.parked = editor;
    return true;
  }

  /** The kept editor, handed to the view that mounts next (null when none is kept). */
  takeParkedEditor(): ParkedDocumentEditor | null {
    const editor = this.parked;
    this.parked = null;
    return editor;
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

  // ── save (run by the record's one coalesced save — documentModels.ts) ─

  private markDirty(): void {
    this.handle.touch();
  }

  private saving = false;
  /**
   * The content of the version the server holds (loaded or last written). A
   * save of the same content is no save: attaching, detaching, waking or a
   * flush of an unchanged document never writes a snapshot row.
   */
  private savedFingerprint: string | null = null;

  /**
   * Write the body as it is now. Returns false when this tab is a collab peer
   * that does not write (the elected host writes the canonical snapshot; a
   * peer's edits reach it through the room). An explicit Save always writes.
   */
  async write(reason: CommitReason): Promise<boolean> {
    const snapshot = this.latest();
    if (!snapshot) throw new Error("There is no open document to save.");
    if (this.collab && !this.collab.isHost() && reason !== "manual") return false;
    const fingerprint = contentFingerprint(snapshot);
    if (reason !== "manual" && fingerprint === this.savedFingerprint) return false;
    const origin = reason === "manual" ? "manual" : "autosave";
    this.saving = true;
    try {
      const { id } = await this.deps.save({ documentId: this.documentId, snapshot, origin });
      this.knownSnapshots.add(id);
      this.savedFingerprint = fingerprint;
    } finally {
      this.saving = false;
    }
    if (this.views.size === 0) this.stored = snapshot;
    this.deps.onSaved?.(this.documentId, origin);
    return true;
  }

  private hasUnsaved(): boolean {
    return this.handle.hasPending();
  }

  hasViews(): boolean {
    return this.views.size > 0;
  }

  // ── realtime (snapshot inserts) ─────────────────────────────────────────

  /** Opened once per document by the first view that asks; idempotent. */
  connectRealtime(open: (onSnapshot: (snapshotId: string) => void) => () => void): void {
    if (this.realtimeClose) return;
    this.realtimeClose = open((snapshotId) => void this.onRemoteSnapshot(snapshotId));
  }

  /**
   * A snapshot was committed (here or elsewhere): show a foreign one in every
   * view. Over unsaved edits it is a CONFLICT — the working copy holds it and
   * no save runs (one would overwrite the collaborator's snapshot) until the
   * person chooses; `overUnsaved` is "Take theirs" (`./documentModels.ts`).
   */
  async onRemoteSnapshot(snapshotId: string, { overUnsaved = false }: { overUnsaved?: boolean } = {}): Promise<void> {
    if (this.collab) return; // the room is the live channel; snapshots are checkpoints
    if (this.knownSnapshots.has(snapshotId)) return; // ours, or already shown
    if (this.saving) return; // our own save's echo, ahead of its response
    if (this.hasUnsaved() && !overUnsaved) {
      this.handle.conflict({ ref: snapshotId });
      return;
    }
    const row = await this.deps.loadLatest(this.documentId);
    if (!row || (this.hasUnsaved() && !overUnsaved) || this.knownSnapshots.has(row.id)) return;
    this.knownSnapshots.add(row.id);
    this.savedFingerprint = contentFingerprint(row.snapshot);
    this.stored = row.snapshot;
    this.relaying = true;
    try {
      for (const view of this.views.values()) view.port.remount(row.snapshot);
      this.parked?.remount(row.snapshot);
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

  // ── lifecycle (driven by the record's session) ──────────────────────

  /** A view arrived on a document with none. */
  wake(): void {
    if (!this.pageClose && this.deps.listenToPage) {
      this.pageClose = this.deps.listenToPage({
        flush: () => void this.handle.flush(),
        hasUnsaved: () => this.hasUnsaved(),
      });
    }
  }

  /**
   * The last view left: leave the collab room (presence must not outlive the
   * person). The snapshot channel stays open while the session is kept alive,
   * so a collaborator's save still reaches the body a returning view boots from.
   */
  rest(): void {
    this.collab?.stop();
    this.collab = null;
    this.awareness = null;
  }

  private closed = false;

  close(): void {
    this.closed = true;
    const parked = this.parked;
    this.parked = null;
    if (parked) {
      try {
        parked.dispose();
      } catch (error) {
        console.warn(`[document-model] could not dispose ${this.documentId}'s kept editor`, error);
      }
    }
    this.realtimeClose?.();
    this.realtimeClose = null;
    this.pageClose?.();
    this.pageClose = null;
  }
}

/**
 * What a snapshot STORES, as a comparable string: everything but the unit id
 * and Univer's revision counter (both move without the content moving).
 */
function contentFingerprint(snapshot: DocumentSnapshotData): string {
  const { id: _id, rev: _rev, ...content } = snapshot as DocumentSnapshotData & { rev?: unknown };
  return JSON.stringify(content);
}

/** Mutations that change what a snapshot stores (never scroll / selection) — the editors' one dirty filter. */
function isContentMutation(info: Readonly<CollabMutationInfo>): boolean {
  return isSnapshotMutation({ id: info.id, type: info.type, params: info.params } as ICommandInfo);
}
