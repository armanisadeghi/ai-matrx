/**
 * Voice samples from a brand's OWN social posts.
 *
 * RULING (2026-10-09, social-first brands): a voice sample is a Source (the server reads
 * `docproc.processed_documents`, never a post row), and a social post has no Source until
 * someone wants one. So the picker lists the brand's own posts straight from `social.*`
 * (role `own` tracked accounts of this brand) and a post becomes a Source ON DEMAND, when
 * the person measures: it is landed through the one landing door (`POST /sources/land`)
 * with a stable identity (`social-post:<id>:<kind>`), so picking the same post twice reuses
 * one Source. No bulk copy of posts into Knowledge, no second sample path on the server.
 *
 * Text rule: a transcript is the creator's spoken voice, so it wins when the post has one;
 * otherwise the caption. Never both glued together (that measures two voices as one).
 */

import { supabase } from "@/utils/supabase/client";
import { landSource } from "@/features/sources/api/sourcesApi";
import type { SourceLandingBody } from "@/features/sources/api/pastedText";
import type { VoiceSampleKind } from "./service";

export type SocialSampleText = "transcript" | "caption";

export interface SocialSampleOption {
  postId: string;
  platform: string;
  handle: string | null;
  url: string;
  postedAt: string | null;
  /** First words of what would be measured. */
  preview: string;
  textKind: SocialSampleText;
  /** Caption (always) — used when no transcript exists. */
  caption: string;
}

/** Posts shorter than this say too little about a voice to be listed. */
export const MIN_SOCIAL_SAMPLE_WORDS = 8;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Sample kind the voice measure understands for a platform. */
export function sampleKindForPlatform(platform: string): VoiceSampleKind {
  if (platform === "x") return "tweet";
  if (platform === "linkedin") return "linkedin";
  return "other";
}

/** The text a post is measured by, and which kind it is. Null when too short to be a sample. */
export function pickSampleText(
  caption: string | null,
  transcript: string | null,
): { text: string; kind: SocialSampleText } | null {
  const spoken = (transcript ?? "").trim();
  if (wordCount(spoken) >= MIN_SOCIAL_SAMPLE_WORDS) return { text: spoken, kind: "transcript" };
  const written = (caption ?? "").trim();
  if (wordCount(written) >= MIN_SOCIAL_SAMPLE_WORDS) return { text: written, kind: "caption" };
  return null;
}

function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

type PostRow = {
  id: string;
  platform: string;
  url: string;
  caption: string | null;
  title: string | null;
  posted_at: string | null;
  profile_id: string | null;
};

/** The brand's own tracked social profiles: profile id -> handle. */
export async function brandOwnProfiles(brandId: string): Promise<Map<string, string | null>> {
  const tracked = await supabase
    .schema("social")
    .from("tracked_account")
    .select("profile_id")
    .eq("brand_id", brandId)
    .eq("role", "own")
    .is("deleted_at", null)
    .limit(200);
  if (tracked.error) throw new Error(`The brand's social accounts could not be read: ${tracked.error.message}`);
  const ids = [...new Set(((tracked.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))];
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const profiles = await supabase.schema("social").from("social_profile").select("id, handle").in("id", ids);
  if (profiles.error) throw new Error(`The brand's social profiles could not be read: ${profiles.error.message}`);
  for (const p of (profiles.data ?? []) as { id: string; handle: string | null }[]) out.set(p.id, p.handle);
  return out;
}

/** The brand's own posts that carry enough words to measure, newest first, optionally by text. */
export async function searchBrandSocialSamples(brandId: string, query: string): Promise<SocialSampleOption[]> {
  const profiles = await brandOwnProfiles(brandId);
  if (profiles.size === 0) return [];
  const term = query.trim().replace(/[%_,()]/g, "");
  let q = supabase
    .schema("social")
    .from("post")
    .select("id, platform, url, caption, title, posted_at, profile_id")
    .in("profile_id", [...profiles.keys()])
    .is("deleted_at", null)
    .eq("is_ad", false)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(80);
  if (term) q = q.ilike("caption", `%${term}%`);
  const posts = await q;
  if (posts.error) throw new Error(`The brand's posts could not be read: ${posts.error.message}`);
  const rows = (posts.data ?? []) as PostRow[];
  if (rows.length === 0) return [];
  const transcripts = await supabase
    .schema("social")
    .from("post_transcript")
    .select("post_id, text, created_at")
    .in("post_id", rows.map((r) => r.id))
    .order("created_at", { ascending: false });
  if (transcripts.error) throw new Error(`Post transcripts could not be read: ${transcripts.error.message}`);
  const spoken = new Map<string, string>();
  for (const t of (transcripts.data ?? []) as { post_id: string; text: string }[]) {
    if (!spoken.has(t.post_id)) spoken.set(t.post_id, t.text);
  }
  const out: SocialSampleOption[] = [];
  for (const r of rows) {
    const chosen = pickSampleText(r.caption, spoken.get(r.id) ?? null);
    if (!chosen) continue;
    out.push({
      postId: r.id,
      platform: r.platform,
      handle: r.profile_id ? (profiles.get(r.profile_id) ?? null) : null,
      url: r.url,
      postedAt: r.posted_at,
      preview: previewOf(chosen.text),
      textKind: chosen.kind,
      caption: r.caption ?? "",
    });
    if (out.length >= 40) break;
  }
  return out;
}

/** The landing body for one post's text. Identity is stable so a re-pick reuses the Source. */
export function buildSocialSampleLanding(args: {
  option: SocialSampleOption;
  text: string;
  organizationId: string;
  userId: string;
  now?: Date;
}): SourceLandingBody {
  const { option } = args;
  const who = option.handle ? `@${option.handle.replace(/^@/, "")}` : option.platform;
  const when = option.postedAt ? ` · ${option.postedAt.slice(0, 10)}` : "";
  const name = `${who} on ${option.platform}${when} (${option.textKind})`;
  return {
    source_kind: "inline",
    source_id: null,
    canonical_identity: `social-post:${option.postId}:${option.textKind}`,
    name,
    mime_type: "text/plain",
    portions: [
      {
        ordinal: 1,
        kind: "section",
        text: args.text,
        locator: { heading_path: [name], text_fragment: args.text.slice(0, 80) },
        method: "native",
      },
    ],
    provenance: {
      origin_client: "web",
      capture_method: "native",
      captured_at: (args.now ?? new Date()).toISOString(),
      user_id: args.userId,
    },
    keep: true,
    visibility: "internal",
    organization_id: args.organizationId,
  };
}

/** Full text of a post's sample (transcript wins), then land it as a Source; returns the Source id. */
export async function landSocialSample(args: {
  option: SocialSampleOption;
  organizationId: string;
  userId: string;
}): Promise<string> {
  const t = await supabase
    .schema("social")
    .from("post_transcript")
    .select("text")
    .eq("post_id", args.option.postId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (t.error) throw new Error(`The post's transcript could not be read: ${t.error.message}`);
  const chosen = pickSampleText(args.option.caption, (t.data as { text: string } | null)?.text ?? null);
  if (!chosen) throw new Error("That post has too little text to measure a voice from.");
  const landed = await landSource(
    buildSocialSampleLanding({ option: args.option, text: chosen.text, organizationId: args.organizationId, userId: args.userId }),
  );
  return landed.processed_document_id;
}
