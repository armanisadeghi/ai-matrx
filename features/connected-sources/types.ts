/**
 * The TypeScript face of the server's connected-sources contract.
 *
 * Nothing here is invented: every field exists on
 * `aidream/api/routers/connected_sources.py`. The Source row is deliberately
 * adapter-independent — a mailbox, a drive and a chat list render through ONE
 * component, exactly as the Library of Sources contract requires.
 */

export interface ConnectedConnectionSummary {
  connection_id: string;
  account_email: string | null;
  status: string;
}

export interface ConnectedAdapterRow {
  adapter: string;
  provider: string;
  title: string;
  browse_outcome: string;
  kinds: string[];
  /** What this adapter cannot reach. Null only when there is no limit. */
  limitation: string | null;
  remedy: string | null;
  connected: boolean;
  connections: ConnectedConnectionSummary[];
  /** A sentence when `connected` is false. Never a bare flag. */
  unavailable_reason: string | null;
}

export interface ConnectedSourceRow {
  id: string;
  external_id: string;
  adapter: string;
  kind: string;
  title: string;
  subtitle: string | null;
  url: string | null;
  author: string | null;
  created_at: string | null;
  modified_at: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  container_id: string | null;
  attributes: Record<string, unknown>;
}

export interface ConnectedBrowseResponse {
  adapter: string;
  connection_id: string;
  sources: ConnectedSourceRow[];
  /** What the provider handed over before the filter ran. */
  scanned: number;
  matched: number;
  elapsed_seconds: number;
  sources_per_second: number;
  has_more: boolean;
  offset: number;
  /** Null when the walk did not reach the end of the provider. */
  total: number | null;
  summary: string;
}

export interface ConnectedBrowseRequest {
  adapter: string;
  connection_id: string;
  container_id?: string | null;
  filter?: {
    query?: string | null;
    kinds?: string[];
    container_id?: string | null;
    ids?: string[];
  };
  limit?: number;
  offset?: number;
}

export interface GoogleCommentReply {
  reply_id: string;
  author_name: string | null;
  author_is_me: boolean;
  created_at: string | null;
  modified_at: string | null;
  content: string;
  action: string | null;
}

export interface GoogleComment {
  comment_id: string;
  author_name: string | null;
  author_is_me: boolean;
  created_at: string | null;
  modified_at: string | null;
  resolved: boolean;
  content: string;
  /** The sentence the comment is anchored to — the thing being corrected. */
  quoted_text: string | null;
  replies: GoogleCommentReply[];
}

export interface GoogleCommentsResponse {
  file_id: string;
  comments: GoogleComment[];
  total_replies: number;
  truncated: boolean;
}

export interface GoogleRevision {
  revision_id: string;
  modified_at: string | null;
  author_name: string | null;
  author_is_me: boolean;
  keep_forever: boolean;
  size_bytes: number | null;
}

export interface GoogleRevisionsResponse {
  file_id: string;
  revisions: GoogleRevision[];
  truncated: boolean;
}

export interface GoogleSlide {
  slide_id: string;
  index: number;
  title: string | null;
  body_text: string;
  speaker_notes: string;
}

export interface GooglePresentationResponse {
  file_id: string;
  title: string;
  slides: GoogleSlide[];
  slides_with_notes: number;
}
