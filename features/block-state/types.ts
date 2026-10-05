// features/block-state/types.ts
//
// BLOCK STATE — what a person does inside an answer, kept server-side from the
// first keystroke through ONE primitive (platform.block_states, doors
// block_state_set / _list_conversation / _dismiss_chip). Design + binding
// rulings: common-docs/projects/remarks/DESIGN-block-state.md.

export type BlockStateScope = "viewer" | "shared";

/** The record that holds the block: `message` (chat answer), `canvas_item`, … */
export type BlockEntityType = string;

/** One platform.block_states row, as the doors and the broadcast return it. */
export interface BlockStateRow {
  id: string;
  entity_type: BlockEntityType;
  entity_id: string;
  block_key: string;
  kind: string;
  scope: BlockStateScope;
  viewer_id: string | null;
  state: Record<string, unknown>;
  state_version: number;
  sent_version: number;
  fingerprint: string | null;
  metadata: Record<string, unknown>;
  version: number;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Everything a host knows about the block it renders (supplied via context). */
export interface BlockStateTarget {
  /** Null while the answer has no database id yet (mid-stream) — writes buffer. */
  entityType: BlockEntityType;
  entityId: string | null;
  /** Null until the block's identity is stable (streaming done). */
  blockKey: string | null;
  kind: string;
  fingerprint: string | null;
  scope: BlockStateScope;
  /** The chat conversation the answer is in (hydration unit + chip home). Null off-chat. */
  conversationId: string | null;
  /** The answer's transcript key (raw, may be client-only mid-stream) — the chip's coalesce identity. */
  messageId: string | null;
  /** The block's position in the answer (chip target + summary only; never its identity). */
  blockIndex: number | null;
}

export interface BlockStateSaveError {
  /** Postgres code from the door (42501 = signed out / no access). */
  code: string | null;
  message: string;
  signedOut: boolean;
}

export function blockRowKey(
  entityType: string,
  entityId: string,
  blockKey: string,
  scope: BlockStateScope,
): string {
  return `${entityType}\u0000${entityId}\u0000${blockKey}\u0000${scope}`;
}

export function rowKeyOf(row: Pick<BlockStateRow, "entity_type" | "entity_id" | "block_key" | "scope">): string {
  return blockRowKey(row.entity_type, row.entity_id, row.block_key, row.scope);
}

/** The hydration unit a block belongs to (one batched read per unit). */
export function hydrationKeyOf(target: Pick<BlockStateTarget, "entityType" | "entityId" | "conversationId">): string | null {
  if (target.entityType === "message") {
    return target.conversationId ? `conversation:${target.conversationId}` : null;
  }
  return target.entityId ? `${target.entityType}:${target.entityId}` : null;
}

/** The chip rule (server contract): saved newer than last sent, and not dismissed at that version. */
export function isChipDue(row: BlockStateRow): boolean {
  if (row.state_version <= row.sent_version) return false;
  const dismissed = row.metadata?.chip_dismissed_version;
  return !(typeof dismissed === "number" && dismissed >= row.state_version);
}

export function isBlockStateRow(value: unknown): value is BlockStateRow {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.entity_type === "string" &&
    typeof r.entity_id === "string" &&
    typeof r.block_key === "string" &&
    typeof r.state_version === "number"
  );
}

/** Normalise a door/broadcast row (the broadcast omits nothing the hook reads). */
export function toBlockStateRow(value: unknown): BlockStateRow | null {
  if (!isBlockStateRow(value)) return null;
  const r = value as unknown as Record<string, unknown>;
  return {
    ...(value as BlockStateRow),
    scope: r.scope === "shared" ? "shared" : "viewer",
    state: r.state && typeof r.state === "object" && !Array.isArray(r.state) ? (r.state as Record<string, unknown>) : {},
    sent_version: typeof r.sent_version === "number" ? r.sent_version : 0,
    metadata: r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {},
    version: typeof r.version === "number" ? r.version : 0,
  };
}
