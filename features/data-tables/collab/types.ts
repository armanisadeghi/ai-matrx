/**
 * Collab types — wire-protocol shapes for the workbook CRDT layer (v2).
 *
 * See `FEATURE.md` in this directory for the full integration plan.
 *
 * V1 of the workbook surface uses snapshot-per-save persistence and is
 * intentionally NOT collaborative beyond hot-swap on remote snapshot.
 * V2 layers Yjs CRDT updates over Supabase Broadcast on top of that store —
 * the snapshot table stays the canonical state, Broadcast handles the
 * ephemeral causal log between active editors.
 *
 * Nothing in this file imports `yjs` so that consumers (e.g. snapshot
 * tooling) can pull the types without dragging the CRDT lib into the bundle.
 * The `Y.Doc` / `Awareness` references in JSDoc point at the types provided
 * by `yjs` and `y-protocols/awareness` once those deps land.
 */

/** Per-peer presence payload. ~80 bytes JSON. */
export type AwarenessState = {
  /** Stable user id (matches auth.uid). */
  uid: string;
  /** Display name as shown next to the cursor. */
  name: string;
  /** Cursor color (hex, e.g. "#3b82f6"). Derived deterministically from uid. */
  color: string;
  /** Univer sheet the cursor is currently focused on. */
  sheetId: string | null;
  /** Cursor row index, 0-based. */
  row: number | null;
  /** Cursor column index, 0-based. */
  col: number | null;
  /** Last-update ms timestamp. Used to age out stale cursors. */
  ts: number;
};

/**
 * Wire envelope for the binary Yjs update over Supabase Broadcast.
 * Broadcast payloads are JSON, so the binary update is base64-encoded.
 */
export type YjsUpdateMessage = {
  type: "y-update";
  /** base64(Uint8Array) of the Yjs update. */
  u: string;
  /** When chunked, the index of this frame (0-based). */
  seq?: number;
  /** When chunked, total number of frames. */
  total?: number;
};

/**
 * Wire envelope for awareness (presence + cursor) updates. Sent on a separate
 * broadcast event so we can throttle independently of the y-update channel.
 */
export type AwarenessMessage = {
  type: "y-awareness";
  /** base64(Uint8Array) of the encoded awareness update. */
  a: string;
};

/**
 * Initial-state request broadcast when a new peer joins. The first existing
 * peer to respond wins; late responses are dropped by client id seen-set.
 */
export type StateRequestMessage = {
  type: "y-request-state";
  /** Random per-connection id so responders can dedupe. */
  clientId: string;
};

/** Response to a StateRequestMessage: the requester's first full doc state. */
export type StateResponseMessage = {
  type: "y-state";
  /** base64(Uint8Array) of `Y.encodeStateAsUpdateV2(doc)`. */
  sv: string;
  /** Echoes the requester id so they accept the right response. */
  forClientId: string;
};

/** Operational metadata stored next to each shared Y.Doc in memory. */
export type WorkbookCollabContext = {
  workbookId: string;
  /** Stable per-tab session id; used in state-request dedupe. */
  clientId: string;
  /** Authenticated user id (matches auth.uid). */
  uid: string;
};

/**
 * Result of the "am I the snapshot host?" deterministic election. The lowest
 * `uid` (lexicographically) among connected peers writes the canonical
 * snapshot; other peers skip the autosave path. Re-evaluated whenever
 * Awareness changes.
 */
export type HostElectionResult = {
  isHost: boolean;
  hostUid: string | null;
};
