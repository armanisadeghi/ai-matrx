/**
 * media-library.ts — data layer for the site Media workspace beyond the
 * crawled inventory: research-captured images (inspiration/reuse), and the
 * site's media standards (persisted at `web.site.settings.media_standards`).
 *
 * Brand asset CRUD stays in `service.ts` (listBrandAssets / createBrandAsset /
 * updateBrandAsset / deleteBrandAsset) — this module never forks it.
 */

import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
} from "@/utils/supabase/webDb";
import { isJsonRecord } from "@/features/marketing/types";
import type { MarketingSite } from "@/features/marketing/types";
import { SITE_COLUMNS } from "@/features/marketing/data/service";

// ============================================================================
// Research images — inspiration + reuse candidates for this brand's org
// ============================================================================

type ResearchMediaRow =
  Database["research"]["Tables"]["rs_media"]["Row"];

export interface ResearchImageRow {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  isRelevant: boolean | null;
  createdAt: string | null;
  topicId: string | null;
  topicName: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceHostname: string | null;
  sourceTitle: string | null;
}

const RESEARCH_IMAGE_LIMIT = 600;

interface ResearchMediaJoinedRow extends ResearchMediaRow {
  rs_source: {
    id: string;
    url: string | null;
    hostname: string | null;
    title: string | null;
  } | null;
  rs_topic: { id: string; name: string | null } | null;
}

/**
 * Every research-captured image visible to this organization, newest first,
 * with its source page and topic. Bounded (newest RESEARCH_IMAGE_LIMIT rows) —
 * the workspace filters client-side by topic / hostname / search. Images the
 * researcher explicitly marked irrelevant are excluded.
 */
export async function fetchResearchImages(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ResearchImageRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const query = supabase
    .schema("research")
    .from("rs_media")
    .select(
      "id, url, thumbnail_url, alt_text, caption, width, height, is_relevant, created_at, topic_id, source_id, rs_source(id, url, hostname, title), rs_topic(id, name)",
    )
    .eq("organization_id", organizationId)
    .eq("media_type", "image")
    .not("url", "is", null)
    .or("is_relevant.is.null,is_relevant.eq.true")
    .order("created_at", { ascending: false })
    .limit(RESEARCH_IMAGE_LIMIT);
  const response = signal ? await query.abortSignal(signal) : await query;
  if (response.error) throw response.error;
  const rows = (response.data ?? []) as unknown as ResearchMediaJoinedRow[];
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    alt: row.alt_text,
    caption: row.caption,
    width: row.width,
    height: row.height,
    isRelevant: row.is_relevant,
    createdAt: row.created_at,
    topicId: row.topic_id,
    topicName: row.rs_topic?.name ?? null,
    sourceId: row.source_id,
    sourceUrl: row.rs_source?.url ?? null,
    sourceHostname: row.rs_source?.hostname ?? null,
    sourceTitle: row.rs_source?.title ?? null,
  }));
}

// ============================================================================
// Site media standards — persisted at web.site.settings.media_standards
// ============================================================================

/** One named image slot the site standardizes (hero, og image, thumbnail…). */
export interface MediaStandardSlot {
  id: string;
  /** Human name of the slot ("Hero", "OG / share card", "Blog header"…). */
  name: string;
  width: number | null;
  height: number | null;
  /** Preferred format, e.g. "webp", "avif", "jpg", "svg". */
  format: string | null;
  /** Max file weight in KB the site tolerates for this slot. */
  maxKb: number | null;
  notes: string;
}

export interface SiteMediaStandards {
  slots: MediaStandardSlot[];
  /** Free-form site-wide rules (naming, tone, subjects to avoid…). */
  notes: string;
}

export const EMPTY_MEDIA_STANDARDS: SiteMediaStandards = {
  slots: [],
  notes: "",
};

/** Sensible starter slots offered when a site has no standards yet. */
export const DEFAULT_STANDARD_SLOTS: Array<
  Omit<MediaStandardSlot, "id">
> = [
  { name: "Hero", width: 1600, height: 900, format: "webp", maxKb: 250, notes: "" },
  { name: "OG / share card", width: 1200, height: 630, format: "jpg", maxKb: 300, notes: "" },
  { name: "Blog header", width: 1200, height: 675, format: "webp", maxKb: 200, notes: "" },
  { name: "Content inline", width: 800, height: 600, format: "webp", maxKb: 150, notes: "" },
  { name: "Thumbnail", width: 400, height: 300, format: "webp", maxKb: 60, notes: "" },
];

function parseSlot(value: Json): MediaStandardSlot | null {
  if (!isJsonRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : null;
  const name = typeof value.name === "string" ? value.name : null;
  if (!id || !name) return null;
  return {
    id,
    name,
    width: typeof value.width === "number" ? value.width : null,
    height: typeof value.height === "number" ? value.height : null,
    format: typeof value.format === "string" ? value.format : null,
    maxKb: typeof value.maxKb === "number" ? value.maxKb : null,
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}

/** Parse `site.settings.media_standards` defensively — never throws. */
export function parseSiteMediaStandards(settings: Json): SiteMediaStandards {
  if (!isJsonRecord(settings)) return EMPTY_MEDIA_STANDARDS;
  const raw = settings.media_standards;
  if (!isJsonRecord(raw)) return EMPTY_MEDIA_STANDARDS;
  const slots = Array.isArray(raw.slots)
    ? raw.slots
        .map(parseSlot)
        .filter((slot): slot is MediaStandardSlot => slot !== null)
    : [];
  return {
    slots,
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

/**
 * Save the site's media standards under `settings.media_standards` with a
 * read-merge-write on the settings blob (sibling settings keys survive) and
 * optimistic concurrency on the site row version.
 */
export async function saveSiteMediaStandards(input: {
  siteId: string;
  expectedVersion: number;
  standards: SiteMediaStandards;
}): Promise<MarketingSite> {
  const db = await authenticatedWebDb(supabase);
  const current = await db
    .from("site")
    .select("settings")
    .eq("id", input.siteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("Site not found.");
  const settings = isJsonRecord(current.data.settings)
    ? current.data.settings
    : {};
  const nextSettings = {
    ...settings,
    media_standards: {
      slots: input.standards.slots,
      notes: input.standards.notes,
    },
  } as unknown as Json;
  const response = await db
    .from("site")
    .update({ settings: nextSettings })
    .eq("id", input.siteId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(SITE_COLUMNS)
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "This site changed in another session. Reload and try again.",
    );
  }
  return response.data;
}
