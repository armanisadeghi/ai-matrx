// features/marketing/voice/service.ts
//
// The Voice page's client half (brand voice: outside-skill-packs spec T1 + Brief 8).
//
//   listFingerprints   → web.voice_fingerprint, DIRECT (a plain read under RLS)
//   searchSources      → docproc.processed_documents, DIRECT (the Sources a person picks as samples)
//   measureVoice       → aidream POST /brand-voice/extract (reads the Sources and runs spaCy)
//   confirmVoice       → aidream POST /brand-voice/{id}/confirm (re-renders the summary line and the
//                        block with the ONE renderer; a brand's voice_tone becomes that line)
//   fixVoice           → aidream POST /brand-voice/fix (the enforce loop on one draft)

import type { components } from "@ai-matrx/agents/generated/api-types";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { supabase } from "@/utils/supabase/client";

export type VoiceMeasureResult = components["schemas"]["VoiceMeasureResult"];
export type VoiceConfirmation = components["schemas"]["VoiceConfirmation"];
export type ConfirmedVoice = components["schemas"]["ConfirmedVoice"];
export type VoiceTextOutcome = components["schemas"]["VoiceTextOutcome"];
export type VoiceSampleRef = components["schemas"]["VoiceSampleRef"];
export type VoiceSampleKind = NonNullable<VoiceSampleRef["source"]>;
export type VoiceSurface = NonNullable<components["schemas"]["VoiceFixRequest"]["surface"]>;
export type VoiceProfileScope = "person" | "brand";

export const SAMPLE_KINDS: readonly VoiceSampleKind[] = [
  "email",
  "slack",
  "tweet",
  "linkedin",
  "blog",
  "pitch",
  "substack",
  "other",
];

export const MIN_SAMPLES = 5;
export const MAX_SAMPLES = 20;

export interface FingerprintRow {
  id: string;
  label: string;
  status: "draft" | "confirmed";
  confidence: string;
  register_label: string | null;
  sample_count: number;
  sample_word_count: number;
  last_extracted_at: string;
  refresh_due_at: string;
  confirmed_at: string | null;
  fingerprint: Record<string, unknown>;
  brand_id?: string | null;
  organization_id?: string | null;
  person_user_id?: string | null;
}

export interface SourceOption {
  id: string;
  name: string;
  created_at: string;
}

const FINGERPRINT_COLUMNS =
  "id, label, status, confidence, register_label, sample_count, sample_word_count, last_extracted_at, refresh_due_at, confirmed_at, fingerprint, brand_id, person_user_id, organization_id";

/** Every live fingerprint of one person or one brand, newest first. */
export async function listFingerprints(
  scope: VoiceProfileScope,
  ownerId: string,
): Promise<FingerprintRow[]> {
  const base = supabase
    .schema("web")
    .from("voice_fingerprint")
    .select(FINGERPRINT_COLUMNS)
    .is("deleted_at", null)
    .order("last_extracted_at", { ascending: false })
    .limit(20);
  const { data, error } =
    scope === "brand"
      ? await base.eq("profile_scope", "brand").eq("brand_id", ownerId)
      : await base.eq("profile_scope", "person").eq("person_user_id", ownerId);
  if (error) throw new Error(`Voice fingerprints could not be read: ${error.message}`);
  return (data ?? []) as unknown as FingerprintRow[];
}

/**
 * Spokespeople of one brand: person-scoped voices (`profile_scope='person'`)
 * whose `brand_id` is this brand. Direct read under RLS.
 */
export async function listBrandSpokespeople(brandId: string): Promise<FingerprintRow[]> {
  const { data, error } = await supabase
    .schema("web")
    .from("voice_fingerprint")
    .select(FINGERPRINT_COLUMNS)
    .is("deleted_at", null)
    .eq("profile_scope", "person")
    .eq("brand_id", brandId)
    .order("last_extracted_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Spokespeople could not be read: ${error.message}`);
  return (data ?? []) as unknown as FingerprintRow[];
}

/** Link a person's voice to a brand as its spokesperson (brandId) or unlink it (null). Direct write under RLS. */
export async function setSpokespersonBrand(fingerprintId: string, brandId: string | null): Promise<void> {
  const { data, error } = await supabase
    .schema("web")
    .from("voice_fingerprint")
    .update({ brand_id: brandId })
    .eq("id", fingerprintId)
    .eq("profile_scope", "person")
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`The spokesperson link could not be saved: ${error.message}`);
  if (!data?.length) throw new Error("The spokesperson link was not saved: that voice is not yours to change.");
}

/**
 * The Source ids that belong to one brand: the processed documents behind its
 * websites' pages (`web.page.processed_document_id` of every site with this
 * `brand_id`) and behind its brand assets (`web.brand_asset.file_id` is a
 * processed document's `original_file_id`). Social posts carry no Source
 * (their text lives on `web.post`), so they are not listed here.
 */
export async function brandSourceIds(brandId: string): Promise<string[]> {
  const [sites, assets] = await Promise.all([
    supabase.schema("web").from("site").select("id").eq("brand_id", brandId).is("deleted_at", null).limit(50),
    supabase
      .schema("web")
      .from("brand_asset")
      .select("file_id")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .not("file_id", "is", null)
      .limit(500),
  ]);
  if (sites.error) throw new Error(`The brand's websites could not be read: ${sites.error.message}`);
  if (assets.error) throw new Error(`The brand's assets could not be read: ${assets.error.message}`);
  const siteIds = ((sites.data ?? []) as { id: string }[]).map((r) => r.id);
  const fileIds = ((assets.data ?? []) as { file_id: string | null }[])
    .map((r) => r.file_id)
    .filter((id): id is string => Boolean(id));

  const ids = new Set<string>();
  if (siteIds.length) {
    const pages = await supabase
      .schema("web")
      .from("page")
      .select("processed_document_id")
      .in("site_id", siteIds)
      .is("deleted_at", null)
      .not("processed_document_id", "is", null)
      .limit(1000);
    if (pages.error) throw new Error(`The brand's pages could not be read: ${pages.error.message}`);
    for (const r of (pages.data ?? []) as { processed_document_id: string | null }[]) {
      if (r.processed_document_id) ids.add(r.processed_document_id);
    }
  }
  if (fileIds.length) {
    const docs = await supabase
      .schema("docproc")
      .from("processed_documents")
      .select("id")
      .in("original_file_id", fileIds)
      .is("deleted_at", null)
      .limit(1000);
    if (docs.error) throw new Error(`The brand's documents could not be read: ${docs.error.message}`);
    for (const r of (docs.data ?? []) as { id: string }[]) ids.add(r.id);
  }
  return [...ids];
}

/**
 * Sources (processed documents) the person can read, newest first, optionally by name.
 * With `brandId`, only that brand's Sources (see `brandSourceIds`); without it, all of theirs.
 */
export async function searchSources(query: string, brandId?: string | null): Promise<SourceOption[]> {
  const term = query.trim().replace(/[%_]/g, "");
  const run = async (ids: string[] | null): Promise<SourceOption[]> => {
    let q = supabase
      .schema("docproc")
      .from("processed_documents")
      .select("id, name, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (ids) q = q.in("id", ids);
    if (term) q = q.ilike("name", `%${term}%`);
    const { data, error } = await q;
    if (error) throw new Error(`Sources could not be listed: ${error.message}`);
    return ((data ?? []) as { id: string; name: string | null; created_at: string }[]).map((row) => ({
      id: row.id,
      name: row.name || "Untitled source",
      created_at: row.created_at,
    }));
  };
  if (!brandId) return run(null);
  const ids = await brandSourceIds(brandId);
  if (ids.length === 0) return [];
  // Chunked so a brand with many pages never overruns the request URL.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const merged = (await Promise.all(chunks.map(run))).flat();
  return merged.sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 40);
}

export async function measureVoice(
  organizationId: string,
  scope: VoiceProfileScope,
  ownerId: string,
  samples: VoiceSampleRef[],
): Promise<VoiceMeasureResult> {
  const { data } = await apiPost(
    "/brand-voice/extract",
    { profile_scope: scope, owner_id: ownerId, samples },
    { organizationId },
  );
  return data;
}

export async function confirmVoice(
  organizationId: string,
  fingerprintId: string,
  edits: VoiceConfirmation,
): Promise<ConfirmedVoice> {
  const { data } = await apiPost(
    buildPath("/brand-voice/{fingerprint_id}/confirm", { fingerprint_id: fingerprintId }),
    edits,
    { organizationId },
  );
  return data;
}

export async function fixVoice(
  organizationId: string,
  fingerprintId: string,
  draft: string,
  surface: VoiceSurface,
): Promise<VoiceTextOutcome> {
  const { data } = await apiPost(
    "/brand-voice/fix",
    { fingerprint_id: fingerprintId, draft, surface },
    { organizationId },
  );
  return data;
}

/** "Refresh due" in words: overdue, or the date. */
export function refreshLabel(refreshDueAt: string, now: Date = new Date()): string {
  const due = new Date(refreshDueAt);
  const date = due.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return due.getTime() <= now.getTime() ? `Refresh overdue since ${date}` : `Refresh due ${date}`;
}
