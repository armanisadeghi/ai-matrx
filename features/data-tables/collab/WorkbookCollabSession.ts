/**
 * WorkbookCollabSession — the Univer ↔ Yjs bridge.
 *
 * Subscribes to Univer's public `commandService.onMutationExecutedForCollab`
 * hook for local mutations and pushes them onto a `Y.Array<MutationOp>` shared
 * via `SupabaseYjsProvider`. Inbound Yjs updates produce `IMutationInfo` ops
 * that are applied through `commandService.syncExecuteCommand` with the
 * `fromCollab` execution option flagged so the outbound listener short-
 * circuits and we don't echo our own apply.
 *
 * See `FEATURE.md` in this directory for the architecture, the "do NOT use
 * the Pro preset" verdict, and the host-election rule. This class is the
 * runtime side of that plan.
 *
 * Lifecycle:
 *   - constructor: wire references, no side effects
 *   - start():   create Y.Doc + Awareness, instantiate provider, subscribe to
 *                command stream, subscribe to Yjs Array observer
 *   - stop():    detach all listeners, dispose provider
 *
 * The session is one-shot per workbook open. Reload = stop() + new instance.
 */
"use client";

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

/**
 * Structural transport contract. `SupabaseYjsProvider` satisfies it in
 * production; the verification harness injects an in-memory loopback
 * transport through the same seam. Keeping this structural (not the concrete
 * class) is what makes the session testable without network.
 */
export type CollabProviderLike = {
  connect(): Promise<void>;
  disconnect(): void;
  ready(): Promise<void>;
};

// Univer types are loose at the public hook boundary; we narrow with a
// structural interface so we don't have to import the full Univer surface.
type MutationParams = Record<string, unknown> | unknown[] | null;

export type CollabMutationInfo = {
  id: string;
  type: number; // CommandType.MUTATION = 2 in Univer's enum
  params: MutationParams;
};

type ExecuteOptions = {
  /** Per-Univer convention: when true, the command runs locally only and is
   *  NOT broadcast to other plugins. We set this on inbound-apply so the
   *  subsequent onMutationExecutedForCollab does NOT re-fire on our peer. */
  onlyLocal?: boolean;
  fromCollab?: boolean;
};

export type CommandServiceLike = {
  onMutationExecutedForCollab(listener: (info: CollabMutationInfo) => void): {
    dispose: () => void;
  };
  syncExecuteCommand(
    id: string,
    params: MutationParams,
    options?: ExecuteOptions,
  ): unknown;
};

export type WorkbookCollabSessionOptions = {
  workbookId: string;
  uid: string;
  clientId: string;
  commandService: CommandServiceLike;
  /** Factory so this file does not statically depend on the provider. */
  makeProvider: (args: {
    workbookId: string;
    clientId: string;
    doc: Y.Doc;
    awareness: Awareness;
  }) => CollabProviderLike;
  /** Called when the awareness set changes (peers join / leave / move cursor). */
  onAwarenessChange?: (awareness: Awareness) => void;
};

const REMOTE_PARAM_TAG = "__matrxRemote";
const MUTATIONS_ARRAY_KEY = "mutations";

export class WorkbookCollabSession {
  private readonly options: WorkbookCollabSessionOptions;
  private doc: Y.Doc | null = null;
  private awareness: Awareness | null = null;
  private provider: CollabProviderLike | null = null;
  private commandDisposer: { dispose: () => void } | null = null;
  private yArrayObserver:
    ((event: Y.YArrayEvent<CollabMutationInfo>) => void) | null = null;
  private awarenessObserver: (() => void) | null = null;
  private started = false;
  private disposed = false;

  constructor(options: WorkbookCollabSessionOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;

    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);

    // Seed local awareness with the user identity. Cursor (sheetId/row/col)
    // is set later via setCursor().
    this.awareness.setLocalState({
      uid: this.options.uid,
      name: this.options.uid.slice(0, 8),
      color: pickColor(this.options.uid),
      sheetId: null,
      row: null,
      col: null,
      ts: Date.now(),
    });

    this.provider = this.options.makeProvider({
      workbookId: this.options.workbookId,
      clientId: this.options.clientId,
      doc: this.doc,
      awareness: this.awareness,
    });

    // Subscribe to inbound Yjs array changes BEFORE connecting the provider,
    // so the initial-state replay (if any) hits our observer.
    const yArray = this.doc.getArray<CollabMutationInfo>(MUTATIONS_ARRAY_KEY);
    this.yArrayObserver = (event) => {
      // Local transactions are OUR OWN pushes from handleLocalMutation —
      // Univer already executed those mutations. Re-applying them here would
      // double-apply every local edit on the originator. Only act on
      // transactions that arrived via Y.applyUpdate (origin 'remote').
      if (event.transaction.local) return;
      for (const change of event.changes.delta) {
        if (!change.insert || !Array.isArray(change.insert)) continue;
        for (const op of change.insert as CollabMutationInfo[]) {
          this.applyRemoteMutation(op);
        }
      }
    };
    yArray.observe(this.yArrayObserver);

    // Awareness change passthrough.
    if (this.options.onAwarenessChange) {
      const cb = this.options.onAwarenessChange;
      this.awarenessObserver = () => {
        if (this.awareness) cb(this.awareness);
      };
      this.awareness.on("change", this.awarenessObserver);
    }

    // Subscribe to Univer's collab-grain mutation stream.
    this.commandDisposer =
      this.options.commandService.onMutationExecutedForCollab((info) =>
        this.handleLocalMutation(info),
      );

    await this.provider.connect();
    await this.provider.ready();
  }

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.commandDisposer?.dispose();
    this.commandDisposer = null;

    if (this.doc && this.yArrayObserver) {
      const yArray = this.doc.getArray<CollabMutationInfo>(MUTATIONS_ARRAY_KEY);
      yArray.unobserve(this.yArrayObserver);
      this.yArrayObserver = null;
    }

    if (this.awareness && this.awarenessObserver) {
      this.awareness.off("change", this.awarenessObserver);
      this.awarenessObserver = null;
    }

    this.provider?.disconnect();
    this.provider = null;

    if (this.awareness) {
      this.awareness.destroy();
      this.awareness = null;
    }

    if (this.doc) {
      this.doc.destroy();
      this.doc = null;
    }
  }

  /**
   * Update the local awareness cursor. Call this from Univer's selection
   * listener (`worksheet.onSelectionChange(...)`). Throttle at the call site
   * (~50ms is plenty); the provider broadcasts on its own debounced cycle.
   */
  setCursor(input: {
    sheetId: string | null;
    row: number | null;
    col: number | null;
  }): void {
    if (!this.awareness) return;
    const current = this.awareness.getLocalState() ?? {};
    this.awareness.setLocalState({
      ...current,
      sheetId: input.sheetId,
      row: input.row,
      col: input.col,
      ts: Date.now(),
    });
  }

  /**
   * Returns the deterministic host: the connected peer with the lowest uid
   * (lexicographic). Host is the only client that writes canonical snapshots.
   * No election protocol; recompute whenever awareness changes.
   */
  electHost(): { isHost: boolean; hostUid: string | null } {
    if (!this.awareness) return { isHost: false, hostUid: null };
    const states = Array.from(this.awareness.getStates().values()) as Array<
      Record<string, unknown>
    >;
    const uids = states
      .map((s) => (typeof s.uid === "string" ? s.uid : null))
      .filter((u): u is string => u !== null)
      .sort();
    const hostUid = uids[0] ?? null;
    return { isHost: hostUid === this.options.uid, hostUid };
  }

  // ─── internals ────────────────────────────────────────────────────────

  private handleLocalMutation(info: CollabMutationInfo): void {
    // Inbound-applied mutations re-fire this listener because Univer's
    // syncExecuteCommand legitimately processes them through the full
    // pipeline. Skip by sniffing the sentinel we stamped on apply.
    if (
      info.params &&
      typeof info.params === "object" &&
      !Array.isArray(info.params) &&
      (info.params as Record<string, unknown>)[REMOTE_PARAM_TAG] === true
    ) {
      return;
    }
    if (!this.doc) return;

    // Normalize params through a JSON round-trip BEFORE pushing into Yjs.
    // Yjs (and the Broadcast transport) only carry JSON-encodable values;
    // Univer types its mutation params as "serializable" but JS objects can
    // smuggle Date / Map / class instances through that promise. The
    // round-trip makes the failure mode deterministic: a non-encodable
    // mutation is skipped with a warning instead of corrupting the shared
    // doc or desyncing peers mid-session. What we push here is byte-for-byte
    // what remote peers will apply, so local-apply == remote-apply.
    let safeParams: MutationParams;
    try {
      safeParams =
        info.params === undefined || info.params === null
          ? null
          : (JSON.parse(JSON.stringify(info.params)) as MutationParams);
    } catch (err) {
      console.warn(
        `[collab] skipping non-serializable mutation "${info.id}" — peers will not receive it`,
        err,
      );
      return;
    }

    const yArray = this.doc.getArray<CollabMutationInfo>(MUTATIONS_ARRAY_KEY);
    yArray.push([{ id: info.id, type: info.type, params: safeParams }]);
  }

  private applyRemoteMutation(op: CollabMutationInfo): void {
    // Wrap params with the sentinel so handleLocalMutation knows not to
    // echo the apply back into Yjs.
    const taggedParams: MutationParams =
      op.params && typeof op.params === "object" && !Array.isArray(op.params)
        ? {
            ...(op.params as Record<string, unknown>),
            [REMOTE_PARAM_TAG]: true,
          }
        : op.params;

    this.options.commandService.syncExecuteCommand(op.id, taggedParams, {
      onlyLocal: true,
      fromCollab: true,
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

const CURSOR_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

function pickColor(uid: string): string {
  // Deterministic FNV-1a-ish hash so the same user is always the same color
  // across sessions and across other users' screens.
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CURSOR_PALETTE[Math.abs(h) % CURSOR_PALETTE.length];
}
