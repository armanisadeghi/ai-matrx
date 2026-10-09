/**
 * What this organization captured in its own browsers about one account (GATED-CAPTURE.md §3–4).
 *
 * Org-private by construction: the captured Source (`docproc.processed_documents`) and its
 * `captured page` edges are the requesting organization's rows, read here under RLS — another
 * organization's reads return nothing. The extraction lives on the Source as
 * `structured_json.social` (`social_capture.v1`); nothing here touches the shared cache.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";

export const CAPTURED_PAGE_LABEL = "captured page";

export type CaptureEntity = "social_profile" | "social_tracked_account" | "web_property" | "social_post";

export interface CapturedPostModel {
  platformPostId: string;
  url: string | null;
  format: string;
  text: string | null;
  postedAt: string | null;
  postedLabel: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  thumbnailUrl: string | null;
  fileIds: string[];
}

export interface CapturedProfileModel {
  displayName: string | null;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  avatarFileId: string | null;
}

export interface BrowserCapture {
  sourceId: string;
  capturedAt: string;
  status: "parsed" | "partial" | "needs_agent" | "failed";
  profile: CapturedProfileModel;
  posts: CapturedPostModel[];
  notes: string[];
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Parse the stored `structured_json.social` block; an unknown shape is skipped, never a crash. */
export function parseBrowserCapture(sourceId: string, capturedAt: string, social: unknown): BrowserCapture | null {
  if (!social || typeof social !== "object") return null;
  const s = social as Json;
  if (s.schema !== "social_capture.v1") return null;
  const p = (s.profile && typeof s.profile === "object" ? s.profile : {}) as Json;
  const posts = Array.isArray(s.posts) ? (s.posts as Json[]) : [];
  const status = s.status === "parsed" || s.status === "partial" || s.status === "failed" ? s.status : "needs_agent";
  return {
    sourceId,
    capturedAt,
    status,
    profile: {
      displayName: str(p.display_name),
      bio: str(p.bio),
      followerCount: num(p.follower_count),
      followingCount: num(p.following_count),
      postCount: num(p.post_count),
      avatarFileId: str(p.avatar_file_id),
    },
    posts: posts
      .filter((x) => str(x.platform_post_id))
      .map((x) => ({
        platformPostId: String(x.platform_post_id),
        url: str(x.url),
        format: str(x.format) ?? "other",
        text: str(x.text),
        postedAt: str(x.posted_at),
        postedLabel: str(x.posted_label),
        views: num(x.views),
        likes: num(x.likes),
        comments: num(x.comments),
        shares: num(x.shares),
        thumbnailUrl: str(x.thumbnail_url),
        fileIds: Array.isArray(x.file_ids) ? (x.file_ids as unknown[]).filter((f): f is string => typeof f === "string") : [],
      })),
    notes: Array.isArray(s.notes) ? (s.notes as unknown[]).filter((n): n is string => typeof n === "string") : [],
  };
}

/** Captures attached to any of these entities, newest first. */
export async function fetchBrowserCaptures(
  targets: { type: CaptureEntity; id: string | null | undefined }[],
): Promise<BrowserCapture[]> {
  const wanted = targets.filter((t): t is { type: CaptureEntity; id: string } => Boolean(t.id));
  if (wanted.length === 0) return [];
  const client = createClient() as unknown as SupabaseClient;
  const ids = new Set<string>();
  for (const t of wanted) {
    const { data, error } = await client
      .schema("platform")
      .from("associations")
      .select("source_id")
      .eq("source_type", "processed_document")
      .eq("target_type", t.type)
      .eq("target_id", t.id)
      .eq("label", CAPTURED_PAGE_LABEL)
      .is("deleted_at", null);
    if (error) throw new Error(`Could not read your browser captures: ${error.message}`);
    for (const row of (data ?? []) as { source_id: string }[]) ids.add(row.source_id);
  }
  if (ids.size === 0) return [];
  const { data, error } = await client
    .schema("docproc")
    .from("processed_documents")
    .select("id, updated_at, social:structured_json->social")
    .in("id", [...ids])
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not read your browser captures: ${error.message}`);
  return ((data ?? []) as { id: string; updated_at: string; social: unknown }[])
    .map((r) => parseBrowserCapture(r.id, r.updated_at, r.social))
    .filter((c): c is BrowserCapture => c !== null);
}

/**
 * Merge: the shared cache first, then captured posts it does not already have (by platform post
 * id), each marked as from the person's browser. The newest capture wins for a repeated post.
 */
export function capturedPostsMissingFrom(
  captures: BrowserCapture[],
  knownPlatformPostIds: ReadonlySet<string>,
): CapturedPostModel[] {
  const out = new Map<string, CapturedPostModel>();
  for (const c of captures) {
    for (const p of c.posts) {
      if (knownPlatformPostIds.has(p.platformPostId) || out.has(p.platformPostId)) continue;
      out.set(p.platformPostId, p);
    }
  }
  return [...out.values()];
}
