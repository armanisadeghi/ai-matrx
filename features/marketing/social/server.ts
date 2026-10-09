/**
 * Social Intelligence — the COMPUTE door: typed calls to the aidream `/social`
 * router (contract: `aidream/aidream/services/social/FEATURE.md`). Only what
 * needs the server goes here — provider fetches, ingest, transcripts, the
 * analysis, the media playback door. Plain reads/edits are `./service.ts`.
 *
 * Every call names the BRAND's organization (carried by the brand context),
 * never the header's selection: the cost lands on that organization.
 *
 * The long doors (ingest post/profile, track, refresh) answer an NDJSON event
 * stream; `callSocial` also accepts a plain JSON answer, so a server that has
 * not converted a door yet still works.
 */

import {
  del,
  downloadBlob,
  downloadBlobWithProgress,
  getJson,
  postJson,
  putJson,
  requestRaw,
} from "@/lib/python-client";
import { BackendApiError, parseHttpError } from "@/lib/api/errors";
import { parseMatrxNdjsonResponse } from "@ai-matrx/agents/matrx";

import { SocialStreamError, consumeSocialEvents } from "./stream";
import type {
  AdLibrary,
  AdsSearchResult,
  AnalyzePostResult,
  IngestPostResult,
  IngestProfileResult,
  PostMediaRef,
  SocialCapabilities,
  SocialCosts,
  SocialCredits,
  SocialErrorCode,
  SocialPlatform,
  SocialProgress,
  TrackAccountInput,
  TrackAccountResult,
  TranscriptOutcome,
} from "./types";

const BASE = "/social";

interface CallOptions {
  organizationId: string;
  signal?: AbortSignal;
  onProgress?: (progress: SocialProgress) => void;
}

function org(organizationId: string): string {
  const id = organizationId?.trim();
  if (!id) {
    throw new Error("This brand's organization is not loaded yet. Try again in a moment.");
  }
  return id;
}

const KNOWN_CODES: readonly SocialErrorCode[] = [
  "social_not_found",
  "social_unsupported",
  "social_not_configured",
  "social_request_invalid",
  "social_forbidden",
  "social_agent_not_built",
  "social_provider_failed",
  "social_profile_empty",
  "social_profile_mismatch",
  "organization_required",
];

/** The server's `detail.code`, wherever the shared error parser left it. */
export function socialErrorCode(error: unknown): SocialErrorCode | null {
  if (error instanceof SocialStreamError) {
    return KNOWN_CODES.find((c) => c === error.code) ?? null;
  }
  if (!(error instanceof Error)) return null;
  const haystack: string[] = [error.message];
  if (error instanceof BackendApiError) {
    haystack.push(error.detail, String(error.code));
    try {
      haystack.push(JSON.stringify(error.details ?? ""));
    } catch {
      /* unserializable details carry no code */
    }
  }
  const text = haystack.join(" ");
  return KNOWN_CODES.find((c) => text.includes(c)) ?? null;
}

/** A person-readable line for a refused call. */
export function socialErrorMessage(error: unknown, fallback: string): string {
  const code = socialErrorCode(error);
  if (code === "social_agent_not_built") return "Breakdown agent not built yet";
  // The server's sentence names the account and the real cause (private, empty,
  // a different handle); a generic line per code only fills in when it is absent.
  const specific =
    error instanceof SocialStreamError
      ? error.userMessage
      : error instanceof BackendApiError
        ? error.userMessage
        : undefined;
  if (code === "social_not_found") {
    return "This page is private or restricted, so it can't be read the usual way.";
  }
  if (code === "social_provider_failed") {
    return "That didn't load just now. Trying again usually works.";
  }
  if (specific) return specific;
  if (code === "social_unsupported") return "That platform or link is not supported yet.";
  if (code === "social_not_configured") return "That provider is not set up.";
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Whether retrying the same call can help (only a transient provider failure). */
export function socialErrorIsRetryable(error: unknown): boolean {
  return socialErrorCode(error) === "social_provider_failed";
}

/** Credits a refused call still cost (a provider bills a missing account). */
export function socialErrorCredits(error: unknown): number | null {
  const details =
    error instanceof SocialStreamError
      ? error.details
      : error instanceof BackendApiError
        ? (error.details as Record<string, unknown> | undefined)
        : undefined;
  const raw = details && typeof details === "object" ? (details as Record<string, unknown>).credits_charged : null;
  return typeof raw === "number" ? raw : null;
}

/**
 * POST a long door. A JSON answer is returned as is; an NDJSON answer is
 * consumed, progress lines go to `onProgress`, and the last result-bearing
 * data event is the answer.
 */
async function callSocial<T>(
  path: string,
  body: unknown,
  opts: CallOptions,
): Promise<T> {
  const response = await requestRaw(
    `${BASE}${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { organizationId: org(opts.organizationId), signal: opts.signal, allowHttpError: true },
  );
  if (!response.ok) throw await parseHttpError(response);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("ndjson") && !type.includes("event-stream")) {
    return (await response.json()) as T;
  }
  const parsed = parseMatrxNdjsonResponse(response, opts.signal);
  return consumeSocialEvents<T>(parsed.events, opts.onProgress);
}

// ---------------------------------------------------------------------------
// Ingest / track
// ---------------------------------------------------------------------------

export function ingestPost(
  input: { url: string; landMedia?: boolean; transcript?: boolean; force?: boolean },
  opts: CallOptions,
): Promise<IngestPostResult> {
  return callSocial<IngestPostResult>(
    "/ingest/post",
    {
      url: input.url,
      land_media: input.landMedia ?? true,
      transcript: input.transcript ?? true,
      force: input.force ?? false,
    },
    opts,
  );
}

export function ingestProfile(
  input: { handleOrUrl: string; platform?: SocialPlatform; pages?: number; force?: boolean },
  opts: CallOptions,
): Promise<IngestProfileResult> {
  return callSocial<IngestProfileResult>(
    "/ingest/profile",
    {
      handle_or_url: input.handleOrUrl,
      platform: input.platform,
      pages: input.pages ?? 1,
      force: input.force ?? false,
    },
    opts,
  );
}

export function trackAccount(
  input: TrackAccountInput,
  opts: CallOptions,
): Promise<TrackAccountResult> {
  return callSocial<TrackAccountResult>(
    "/tracked",
    {
      profile_id: input.profileId,
      handle_or_url: input.handleOrUrl,
      platform: input.platform,
      role: input.role,
      brand_id: input.brandId,
      property_id: input.role === "own" ? input.propertyId : undefined,
      label: input.label,
      notes: input.notes,
      pages: input.pages ?? 1,
      allow_empty: input.allowEmpty ?? false,
    },
    opts,
  );
}

export async function untrackAccount(
  trackedAccountId: string,
  opts: CallOptions,
): Promise<{ tracked_account_id: string; archived: boolean }> {
  const { data } = await del<{ tracked_account_id: string; archived: boolean }>(
    `${BASE}/tracked/${trackedAccountId}`,
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
  if (!data) throw new Error("The server did not confirm the removal.");
  return data;
}

export function refreshProfile(
  profileId: string,
  input: { pages?: number; force?: boolean },
  opts: CallOptions,
): Promise<IngestProfileResult> {
  return callSocial<IngestProfileResult>(
    `/profiles/${profileId}/refresh`,
    { pages: input.pages ?? 1, force: input.force ?? false },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Post actions
// ---------------------------------------------------------------------------

export async function getTranscript(postId: string, opts: CallOptions): Promise<TranscriptOutcome> {
  const { data } = await postJson<TranscriptOutcome>(
    `${BASE}/posts/${postId}/transcript`,
    {},
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
  return data;
}

/**
 * Breakdown. While the agent factory has not bound the Holder the server
 * answers 409 `social_agent_not_built` — callers branch on `socialErrorCode`.
 */
export async function analyzePost(postId: string, opts: CallOptions): Promise<AnalyzePostResult> {
  const { data } = await postJson<AnalyzePostResult>(
    `${BASE}/posts/${postId}/analyze`,
    {},
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
  return data;
}

export async function listPostMedia(postId: string, opts: CallOptions): Promise<PostMediaRef[]> {
  const { data } = await getJson<PostMediaRef[]>(`${BASE}/posts/${postId}/media`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
  return data;
}

/**
 * Bytes through the signed playback door as a local object URL. The caller
 * revokes it (`URL.revokeObjectURL`) when the player unmounts.
 */
export async function fetchPlaybackUrl(
  door: string,
  opts: CallOptions & { onBytes?: (loaded: number, total: number | null) => void },
): Promise<string> {
  const path = door.startsWith("/") ? door : `/${door}`;
  const target = path.startsWith(BASE) ? path : `${BASE}${path}`;
  const requestOptions = { organizationId: org(opts.organizationId), signal: opts.signal };
  const { blob } = opts.onBytes
    ? await downloadBlobWithProgress(target, (e) => opts.onBytes?.(e.loaded, e.total), requestOptions)
    : await downloadBlob(target, requestOptions);
  return URL.createObjectURL(blob);
}

/** The stored thumbnail door of a post (small JPEG; 404 when none was stored). */
export const postThumbnailDoor = (postId: string): string => `${BASE}/posts/${postId}/thumbnail`;

/** The stored avatar door of an account (small JPEG; 404 when none was stored). */
export const profileAvatarDoor = (profileId: string): string => `${BASE}/profiles/${profileId}/avatar`;

// ---------------------------------------------------------------------------
// Swipe file
// ---------------------------------------------------------------------------

export async function createCollection(
  input: { name: string; description?: string; brandId?: string },
  opts: CallOptions,
): Promise<{ collection_id: string; name: string }> {
  const { data } = await postJson<{ collection_id: string; name: string }>(
    `${BASE}/collections`,
    { name: input.name, description: input.description, brand_id: input.brandId },
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
  return data;
}

export async function addToCollection(
  collectionId: string,
  item: {
    itemType: "social_post" | "social_ad" | "social_profile";
    itemId: string;
    /** Carried onto the membership edge; omit both to leave an existing edge's note/tags alone. */
    note?: string;
    tags?: string[];
  },
  opts: CallOptions,
): Promise<void> {
  await postJson(
    `${BASE}/collections/${collectionId}/items`,
    { item_type: item.itemType, item_id: item.itemId, note: item.note, tags: item.tags },
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
}

/** Replace the note and tags kept on one saved item in one collection. */
export async function setItemNotes(
  collectionId: string,
  item: { itemType: "social_post" | "social_ad"; itemId: string; note: string; tags: string[] },
  opts: CallOptions,
): Promise<void> {
  await putJson(
    `${BASE}/collections/${collectionId}/items/${item.itemType}/${item.itemId}`,
    { note: item.note, tags: item.tags },
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
}

export async function removeFromCollection(
  collectionId: string,
  item: { itemType: "social_post" | "social_ad"; itemId: string },
  opts: CallOptions,
): Promise<void> {
  await del(`${BASE}/collections/${collectionId}/items/${item.itemType}/${item.itemId}`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

/** One search of an ad library. A hard cost charged in points (`useSocialSpend`). */
export async function searchAds(
  input: { library: AdLibrary; query?: string; advertiser?: string; cursor?: string },
  opts: CallOptions,
): Promise<AdsSearchResult> {
  const { data } = await postJson<AdsSearchResult>(
    `${BASE}/ads/search`,
    {
      library: input.library,
      query: input.query?.trim() || undefined,
      advertiser: input.advertiser?.trim() || undefined,
      cursor: input.cursor,
    },
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Provider status + credits (Operations)
// ---------------------------------------------------------------------------

export async function getCapabilities(opts: CallOptions): Promise<SocialCapabilities> {
  const { data } = await getJson<SocialCapabilities>(`${BASE}/capabilities`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
  return data;
}

/** What each social action costs (USD, from the ledger's price knob). Render it with `useSocialSpend`. */
export async function getCosts(opts: CallOptions): Promise<SocialCosts> {
  const { data } = await getJson<SocialCosts>(`${BASE}/costs`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
  return data;
}

export async function getCredits(opts: CallOptions): Promise<SocialCredits> {
  const { data } = await getJson<SocialCredits>(`${BASE}/credits`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
  return data;
}
