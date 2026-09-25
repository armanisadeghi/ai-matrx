// features/rich-document/annotations/types.ts
//
// The sidecar's narrow contract (content-annotations-storage-brief "Sidecar
// boundary"): the SURFACE supplies source identity + current version and its
// canonical text; the sidecar owns selection, anchors, storage calls,
// permission-filtered retrieval and display. The source body is never
// rewritten except by an explicit accepted suggestion, through `save`.

import type { HighlightColor } from "./constants";
import type { TextAnchor } from "./anchor";
import type { ResolvedAnchor } from "./resolve";

/** A first-party source the sidecar can anchor into. */
export interface AnnotationSource {
  /** Registered entity token of the source record (`document`, `note`, …). */
  token: string;
  id: string;
  title: string;
  /** The canonical body the renderer renders — anchors index into THIS. */
  body: string;
  /** The version `body` is (content.document.content_version; a note's version). */
  contentVersion: number;
  /** Read the body at an earlier version (the resolver's "mapped" rung); absent = no version store. */
  readVersionBody?: (contentVersion: number) => Promise<string | null>;
  /**
   * The source's own save adapter — the ONLY way an accepted suggestion
   * reaches the body (a splice: only the touched block changes). Absent =
   * suggestions can be made and discussed but not applied here.
   */
  save?: (nextBody: string) => Promise<void>;
  /** In-app path back to this source, used in @-mention notices. */
  href?: string;
}

/** Durable-write state of one item (brief: pending / confirmed / failed; orphan is resolution). */
export type SaveState = "pending" | "confirmed" | "failed";

/** highlight = private passage mark (+ optional note); note = private note on the whole document. */
export type AnnotationKind = "highlight" | "note" | "comment" | "suggestion" | "link";

export interface AnnotationAuthor {
  id: string | null;
  name: string;
  avatarUrl?: string | null;
}

export interface CommentReply {
  id: string;
  /** Row version for compare-and-swap edits (null until the RC-B11 door returns it). */
  version: number | null;
  body: string;
  author: AnnotationAuthor;
  createdAt: string;
  mine: boolean;
  /** When the author last changed the text (null = never; resolve/reopen never set it). */
  editedAt?: string | null;
}

export interface LinkedTarget {
  token: string;
  id: string;
  title: string;
  href?: string | null;
}

export interface AnnotationItem {
  /** Stable client key (server id once confirmed; a draft key before). */
  key: string;
  kind: AnnotationKind;
  saveState: SaveState;
  /** The sentence shown when saveState is failed. */
  error?: string;
  /** Null = the whole document. */
  anchor: TextAnchor | null;
  author: AnnotationAuthor;
  mine: boolean;
  createdAt: string;
  /** When the author last changed the text (null = never). */
  editedAt?: string | null;
  /** Comment text, or a highlight's private note. */
  body: string;
  color?: HighlightColor;
  suggestedText?: string | null;
  resolvedAt?: string | null;
  replies: CommentReply[];
  link?: LinkedTarget;
  /** Minted once per draft, reused by every Retry: the create is idempotent on it. */
  clientRequestId?: string;
  /** When this draft's first attempt started (bounds the lost-response read-back). */
  firstAttemptAt?: string;
  /** Row version of a comment, for compare-and-swap edits. */
  version?: number | null;
  /** Server identities, per kind. */
  commentId?: string;
  annotationDocumentId?: string;
  edgeId?: string;
}

export interface ResolvedItem extends AnnotationItem {
  /** Where the anchor lands in the current body (null for whole-document items). */
  resolution: ResolvedAnchor | null;
}

/** What the connected store can do right now (absent controls, never dead ones). */
export interface SidecarCapabilities {
  /** Passage writes (see ANCHOR_WRITES_ENABLED). */
  anchoredWrites: boolean;
  /** The RC-B11 comment doors (resolution, suggestions, mentions) are live. */
  collaborationDoors: boolean;
  /** The installed association vocabulary knows this source type, so links can be written. */
  links: boolean;
  /** CSS Custom Highlight API present — otherwise the panel still lists everything. */
  paint: boolean;
}
