// features/comments/types.ts
//
// Canonical types for the unified comments primitive — `platform.comments`.
//
// One comment table for EVERY entity in the app (tasks first; notes, agents,
// conversations next), threaded via `parentId`. Reached ONLY through the
// `cmt_*` SECURITY-DEFINER RPCs, and every call to those RPCs goes through
// `features/comments/service/commentsService.ts` — the sole chokepoint. No
// other file talks to `cmt_*` or `.from("platform.comments")`.
//
// The service envelope (`ScopesRpcResult`) and its `ok`/`err` builders are
// shared across the canonical chokepoints — see
// `features/scopes/service/rpcResult.ts`. Comments reuse that envelope rather
// than forking a parallel result type.

import type { EntityType } from "@/features/scopes/types";

/** The author of a comment, denormalized by `cmt_list` from the auth user. */
export interface CommentAuthor {
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * One `platform.comments` row, camelCased (mirrors `cmt_list`'s return).
 * Threading is by `parentId`: a top-level comment has `parentId === null`;
 * a reply points at its parent. `cmt_list` returns rows oldest→newest so
 * callers can build the thread in one pass.
 */
export interface Comment {
  id: string;
  orgId: string | null;
  entityType: string;
  entityId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  author: CommentAuthor;
}

/** `entityType` accepted by the comments primitive — the canonical vocabulary. */
export type CommentEntityType = EntityType;
