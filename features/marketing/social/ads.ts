/**
 * Ads — pure rules: a `social.ad` row -> the card model, "days live", the
 * "Likely winner" fact, and what an advertiser look has newly seen. No I/O, so
 * every rule is unit-tested (`__tests__/ads.test.ts`).
 */

import { num } from "./mappers";
import type { AdCardModel, AdvertiserDefinition, SocialAdRow } from "./types";

const DAY_MS = 86_400_000;

/** Days live that earn the "Likely winner" fact (UI-SPEC §6: a knob, default 30). */
export const LIKELY_WINNER_DAYS = 30;

interface MediaLike {
  url?: unknown;
  kind?: unknown;
  variant?: unknown;
}

/** The first usable preview image: a thumbnail, else an image; never a video file. */
export function adThumbnail(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  const items = media.filter((m): m is MediaLike => !!m && typeof m === "object");
  const pick = (kind: string) =>
    items.find((m) => String(m.kind).toLowerCase().includes(kind) && typeof m.url === "string");
  const found = pick("thumbnail") ?? pick("image");
  return found && typeof found.url === "string" ? found.url : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

export function toAdCardModel(row: SocialAdRow): AdCardModel {
  const payload =
    row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
      ? (row.raw_payload as Record<string, unknown>)
      : {};
  const status = row.status === "active" || row.status === "inactive" ? row.status : "unknown";
  return {
    adId: row.id,
    library: row.library,
    platformAdId: row.platform_ad_id,
    advertiser: row.advertiser_name,
    advertiserPlatformId: row.advertiser_platform_id,
    headline: row.headline?.trim() ?? "",
    body: row.body?.trim() ?? "",
    cta: row.cta?.trim() ?? "",
    landingUrl: row.landing_url,
    libraryUrl: row.library_url,
    format: row.format ?? "other",
    status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    placements: strings(row.placements),
    countries: strings(row.countries),
    thumbnailUrl: adThumbnail(payload.media),
    firstSeenAt: row.first_seen_at,
    removed: row.deleted_at !== null && row.deleted_at !== undefined,
  };
}

/** Whole days an ad has run: start to end, or to `now` while it is active/unknown. Null without a start. */
export function daysLive(ad: Pick<AdCardModel, "startedAt" | "endedAt" | "status">, now = Date.now()): number | null {
  const start = ad.startedAt ? Date.parse(ad.startedAt) : NaN;
  if (!Number.isFinite(start)) return null;
  const endParsed = ad.endedAt ? Date.parse(ad.endedAt) : NaN;
  const end = Number.isFinite(endParsed) && ad.status !== "active" ? endParsed : now;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** "Live 45d" / "Ran 12d" / "" — the run line on a card. */
export function runLabel(ad: Pick<AdCardModel, "startedAt" | "endedAt" | "status">, now = Date.now()): string {
  const d = daysLive(ad, now);
  if (d === null) return "";
  return ad.status === "active" ? `Live ${d}d` : `Ran ${d}d`;
}

/** A fact, not a prediction: still active and live at least `threshold` days. */
export function isLikelyWinner(
  ad: Pick<AdCardModel, "startedAt" | "endedAt" | "status">,
  threshold = LIKELY_WINNER_DAYS,
  now = Date.now(),
): boolean {
  const d = daysLive(ad, now);
  return ad.status === "active" && d !== null && d >= threshold;
}

/** Ads the library showed that this organization had not seen at the last look. */
export function newSinceLook(
  ads: readonly AdCardModel[],
  lastLookAt: string | null,
): AdCardModel[] {
  const cutoff = lastLookAt ? Date.parse(lastLookAt) : NaN;
  if (!Number.isFinite(cutoff)) return [...ads];
  return ads.filter((a) => {
    const seen = a.firstSeenAt ? Date.parse(a.firstSeenAt) : NaN;
    return Number.isFinite(seen) && seen > cutoff;
  });
}

export type AdSort = "latest" | "longest";

export function sortAds(ads: readonly AdCardModel[], sort: AdSort, now = Date.now()): AdCardModel[] {
  const started = (a: AdCardModel) => (a.startedAt ? Date.parse(a.startedAt) : 0) || 0;
  const copy = [...ads];
  if (sort === "longest") {
    return copy.sort((a, b) => (daysLive(b, now) ?? -1) - (daysLive(a, now) ?? -1));
  }
  return copy.sort((a, b) => started(b) - started(a));
}

/** Read a saved advertiser definition defensively (a jsonb nobody validated). */
export function parseAdvertiserDefinition(raw: unknown): AdvertiserDefinition | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const library = typeof r.library === "string" ? r.library : "";
  if (!["meta", "tiktok", "google", "linkedin"].includes(library)) return null;
  const advertiser = typeof r.advertiser === "string" ? r.advertiser.trim() : "";
  if (!advertiser) return null;
  const last = typeof r.lastLookAt === "string" && Number.isFinite(Date.parse(r.lastLookAt)) ? r.lastLookAt : null;
  if (!last) return null;
  return {
    version: 1,
    library: library as AdvertiserDefinition["library"],
    advertiser,
    advertiserPlatformId: typeof r.advertiserPlatformId === "string" ? r.advertiserPlatformId : null,
    lastLookAt: last,
  };
}

/** Credits in the search button's tooltip: `~1 credit`; unknown stays honest. */
export function creditsLabel(credits: number | null | undefined): string {
  const n = num(credits);
  if (n === null) return "Cost not reported";
  return `${n} ${n === 1 ? "credit" : "credits"}`;
}
