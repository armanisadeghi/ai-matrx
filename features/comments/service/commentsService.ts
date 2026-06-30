// features/comments/service/commentsService.ts
//
// THE SOLE CHOKEPOINT for the unified comment table — `platform.comments`.
//
// This is the canonical comment primitive for the whole app: a threaded
// comment on ANY entity (tasks first; notes, agents, conversations next),
// replacing the per-feature legacy comment junction tables.
// The client has NO direct grant on `platform.comments`; every read/write
// goes through the four PUBLIC SECURITY-DEFINER RPCs (cmt_list / cmt_add /
// cmt_edit / cmt_delete) — and every call to those RPCs goes through THIS
// file. No other file is allowed to call them. Like `associationsService`,
// methods always return a `ScopesRpcResult` and NEVER throw.
//
// Org resolution lives in the RPC: `cmt_add` resolves the org from the task
// when `entityType === 'task'`, otherwise falls back to the caller's personal
// org (pass `orgId` to override). Soft-delete is enforced server-side
// (`cmt_delete` — author or org member); `cmt_edit` is author-only.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  err,
  mapPgErrorPair,
  mapPgError,
  ok,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { Comment, CommentEntityType } from "@/features/comments/types";

// Shape of one `cmt_list` row (snake_case, straight from PG).
interface CmtListRow {
  id: string;
  organization_id: string | null;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author_email: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
}

function toComment(row: CmtListRow): Comment {
  return {
    id: row.id,
    orgId: row.organization_id ?? null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    parentId: row.parent_id ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
    author: {
      email: row.author_email ?? null,
      displayName: row.author_display_name ?? null,
      avatarUrl: row.author_avatar_url ?? null,
    },
  };
}

export const commentsService = {
  // ──────────────────────────────────────────────────────────────────
  //  READ — every comment on one entity (oldest→newest; thread by parentId).
  // ──────────────────────────────────────────────────────────────────

  /**
   * All comments on `${entityType}:${entityId}`, org-filtered by RLS inside
   * the RPC, ordered oldest→newest. Build the thread from each row's
   * `parentId` (top-level comments have `parentId === null`).
   */
  async listForEntity(
    entityType: CommentEntityType,
    entityId: string,
  ): Promise<ScopesRpcResult<{ comments: Comment[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("cmt_list", {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as CmtListRow[];
      return ok({ comments: rows.map(toComment) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — add a comment (or a reply when `parentId` is set).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Post `body` on `${entityType}:${entityId}`. Pass `parentId` to reply to an
   * existing comment. Org resolves from the task when `entityType === 'task'`,
   * else from the caller's personal org; pass `orgId` to override. Returns the
   * new comment id.
   */
  async add(args: {
    entityType: CommentEntityType;
    entityId: string;
    body: string;
    parentId?: string | null;
    orgId?: string | null;
  }): Promise<ScopesRpcResult<{ id: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("cmt_add", {
        p_entity_type: args.entityType,
        p_entity_id: args.entityId,
        p_body: args.body,
        p_parent_id: args.parentId ?? undefined,
        p_org_id: args.orgId ?? undefined,
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "cmt_add returned no comment id");
      }
      return ok({ id: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — edit a comment body (author only, enforced in the RPC).
  // ──────────────────────────────────────────────────────────────────

  /** Replace a comment's body. Author-only; the RPC rejects everyone else. */
  async edit(id: string, body: string): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("cmt_edit", {
        p_id: id,
        p_body: body,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — soft-delete a comment (author or org member, in the RPC).
  // ──────────────────────────────────────────────────────────────────

  /** Soft-delete a comment. Author or org member; enforced server-side. */
  async remove(id: string): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("cmt_delete", { p_id: id });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
