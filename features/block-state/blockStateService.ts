// features/block-state/blockStateService.ts
//
// The ONE client for the block-state doors. No other code writes block state.

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  toBlockStateRow,
  type BlockStateRow,
  type BlockStateSaveError,
  type BlockStateScope,
} from "./types";

export class BlockStateWriteError extends Error {
  readonly detail: BlockStateSaveError;
  constructor(detail: BlockStateSaveError) {
    super(detail.message);
    this.name = "BlockStateWriteError";
    this.detail = detail;
  }
}

function toSaveError(error: { code?: string; message: string }): BlockStateSaveError {
  const signedOut = error.code === "42501" && /sign in/i.test(error.message);
  return { code: error.code ?? null, message: error.message, signedOut };
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export interface SetBlockStateArgs {
  entityType: string;
  entityId: string;
  blockKey: string;
  kind: string;
  scope: BlockStateScope;
  patch: Record<string, unknown>;
  fingerprint: string | null;
}

/** Merge-patch one block's state (null value removes a key). Throws BlockStateWriteError. */
export async function setBlockState(args: SetBlockStateArgs): Promise<BlockStateRow> {
  const { data, error } = await supabase.rpc("block_state_set", {
    p_entity_type: args.entityType,
    p_entity_id: args.entityId,
    p_block_key: args.blockKey,
    p_kind: args.kind,
    p_scope: args.scope,
    p_patch: args.patch as Json,
    p_fingerprint: args.fingerprint ?? undefined,
    p_client_request_id: newRequestId(),
  });
  if (error) throw new BlockStateWriteError(toSaveError(error));
  const row = toBlockStateRow(data);
  if (!row) throw new BlockStateWriteError({ code: null, message: "The server returned no saved state.", signedOut: false });
  return row;
}

function rowsOf(data: unknown): BlockStateRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const row = toBlockStateRow(entry);
    return row ? [row] : [];
  });
}

/** One batched read: every block state in a conversation (shared + the caller's own). */
export async function listConversationBlockStates(conversationId: string): Promise<BlockStateRow[]> {
  const { data, error } = await supabase.rpc("block_state_list_conversation", { p_conversation_id: conversationId });
  if (error) throw new BlockStateWriteError(toSaveError(error));
  return rowsOf(data);
}

/** Block states of non-message records (a canvas item, a note…). */
export async function listEntityBlockStates(entityType: string, entityIds: string[]): Promise<BlockStateRow[]> {
  const { data, error } = await supabase.rpc("block_state_list", { p_entity_type: entityType, p_entity_ids: entityIds });
  if (error) throw new BlockStateWriteError(toSaveError(error));
  return rowsOf(data);
}

/** The chip's X: dismiss this row's chip at its current version. */
export async function dismissBlockStateChip(id: string): Promise<BlockStateRow | null> {
  const { data, error } = await supabase.rpc("block_state_dismiss_chip", { p_id: id });
  if (error) throw new BlockStateWriteError(toSaveError(error));
  return toBlockStateRow(data);
}

/**
 * The person's own unsent remark rows staged into this conversation, or — for a
 * conversation that has no persisted record yet — into the same surface (a fresh
 * conversation id is minted on every mount of /chat/new).
 */
export async function listStagedBlockStates(conversationId: string, surface: string | null): Promise<BlockStateRow[]> {
  const { data, error } = await supabase.rpc("block_state_list_staged", {
    p_conversation_id: conversationId,
    p_surface: surface ?? undefined,
  });
  if (error) throw new BlockStateWriteError(toSaveError(error));
  return rowsOf(data);
}
