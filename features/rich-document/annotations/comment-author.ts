// features/rich-document/annotations/comment-author.ts
//
// Who wrote a comment row, as the panel shows it. A row an agent run wrote
// (a `comment_reply`) is filed under the person whose run it was — so
// `created_by` is theirs — and carries the agent: the panel names the AGENT,
// with the agent mark, and never offers to edit its words.

import type { AnnotationAuthor } from "./types";

export interface CommentAuthorRow {
  created_by: string | null;
  author_display_name: string | null;
  author_email: string | null;
  author_avatar_url: string | null;
  /** The agent that wrote the row (cmt_list; threads ruling R5). Absent until the server returns it. */
  created_by_agent_id?: string | null;
  author_agent_id?: string | null;
  author_agent_name?: string | null;
  created_by_agent_name?: string | null;
}

export function authorOf(row: CommentAuthorRow): AnnotationAuthor {
  const agentId = row.created_by_agent_id ?? row.author_agent_id ?? null;
  if (agentId) {
    const name = row.author_agent_name || row.created_by_agent_name || "Agent";
    return { id: row.created_by, name, avatarUrl: null, agent: { id: agentId, name } };
  }
  return {
    id: row.created_by,
    name: row.author_display_name || row.author_email || "Someone",
    avatarUrl: row.author_avatar_url,
  };
}
