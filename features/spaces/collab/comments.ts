// features/spaces/collab/comments.ts — a Space's comments (H1) on the platform's ONE comment store.
//
// Every call crosses the same `cmt_*` seam the rich-document sidecar uses (associationsDataSource.rpc,
// reached through features/rich-document/annotations/service.ts): edit (compare-and-swap), delete
// (soft — archive), resolve / reopen, @-mention people and their notices are that service's own
// functions. The two calls written here are the ones the sidecar cannot make for a Space:
//   - cmt_list read raw, because a Space anchors to a BLOCK (`part_anchor`, part_key "block:<id>",
//     BLOCK-SCHEMA § Comments) and the sidecar keeps only text anchors;
//   - cmt_add with that part_anchor (the sidecar's addComment refuses anything but a text anchor).
// The quoted text of an inline comment rides in the anchor's `label` (≤200 chars) — the margin finds
// it inside the block again to highlight it.

import { associationsDataSource } from "@/features/scopes/host/associationsStore";
import { authorOf, type CommentAuthorRow } from "@/features/rich-document/annotations/comment-author";
import { humanError } from "@/features/rich-document/annotations/errors";
import type { AnnotationAuthor, AnnotationSource } from "@/features/rich-document/annotations/types";
import { getUserId } from "@/utils/auth/getUserId";

export {
  deleteComment,
  editComment,
  notifyMentions,
  resolveComment,
} from "@/features/rich-document/annotations/service";
export { mentionedUserIds } from "@/features/rich-document/annotations/mentions";

type Seam = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
const seam = ((fn: string, args: Record<string, unknown>) =>
  associationsDataSource.rpc(fn as never, args as never)) as unknown as Seam;

/** A Space as the comment door names it: a `content.document`. */
export function spaceCommentSource(spaceId: string, title: string): AnnotationSource {
  return { token: "document", id: spaceId, title: title || "Untitled", body: "", contentVersion: 0, href: `/spaces/${spaceId}` };
}

export interface SpaceCommentAnchor {
  blockId: string;
  /** The text the comment is about (an inline comment's selection, or the block's own text). */
  quote: string;
}

export interface SpaceComment {
  id: string;
  body: string;
  author: AnnotationAuthor;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  version: number | null;
}

export interface SpaceThread extends SpaceComment {
  /** Null = a comment on the whole page. */
  anchor: SpaceCommentAnchor | null;
  resolvedAt: string | null;
  replies: SpaceComment[];
}

interface Row extends CommentAuthorRow {
  id: string;
  parent_id: string | null;
  body: string | null;
  created_at: string;
  anchor: unknown;
  resolved_at: string | null;
  version: number | null;
  edited_at: string | null;
}

const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && typeof (v as Row).id === "string" && typeof (v as Row).created_at === "string";

function blockAnchor(raw: unknown): SpaceCommentAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { __kind?: unknown; part_key?: unknown; label?: unknown };
  if (a.__kind !== "part_anchor" || typeof a.part_key !== "string" || !a.part_key.startsWith("block:")) return null;
  return { blockId: a.part_key.slice("block:".length), quote: typeof a.label === "string" ? a.label : "" };
}

function comment(row: Row, me: string | null): SpaceComment {
  return {
    id: row.id,
    body: row.body ?? "",
    author: authorOf(row),
    mine: !!me && row.created_by === me && !authorOf(row).agent,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    version: typeof row.version === "number" ? row.version : null,
  };
}

/** Every thread on the page, oldest first, replies nested. */
export async function listSpaceThreads(spaceId: string): Promise<SpaceThread[]> {
  const { data, error } = await seam("cmt_list", { p_entity_type: "document", p_entity_id: spaceId });
  if (error) throw humanError("loading the comments", error);
  const rows = Array.isArray(data) ? data.filter(isRow) : [];
  const me = getUserId();
  const roots = new Map<string, SpaceThread>();
  for (const row of rows) {
    if (row.parent_id) continue;
    roots.set(row.id, { ...comment(row, me), anchor: blockAnchor(row.anchor), resolvedAt: row.resolved_at ?? null, replies: [] });
  }
  for (const row of rows) {
    if (row.parent_id) roots.get(row.parent_id)?.replies.push(comment(row, me));
  }
  return [...roots.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A new thread (anchor = a block) or a reply (parentId). Retry-safe on `requestId`. */
export async function addSpaceComment(input: {
  spaceId: string;
  body: string;
  anchor?: SpaceCommentAnchor | null;
  parentId?: string | null;
  requestId: string;
}): Promise<string> {
  const args: Record<string, unknown> = {
    p_entity_type: "document",
    p_entity_id: input.spaceId,
    p_body: input.body,
    p_parent_id: input.parentId ?? null,
    p_client_request_id: input.requestId,
  };
  if (input.anchor && !input.parentId) {
    const label = input.anchor.quote.replace(/\s+/g, " ").trim().slice(0, 200);
    args.p_anchor = { __kind: "part_anchor", part_key: `block:${input.anchor.blockId}`, ...(label ? { label } : {}) };
  }
  const { data, error } = await seam("cmt_add", args);
  if (error) throw humanError("posting your comment", error);
  if (typeof data !== "string") throw humanError("posting your comment", new Error("the server returned no id"));
  return data;
}
