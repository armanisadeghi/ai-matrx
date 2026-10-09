/**
 * Social Intelligence — the COMPUTE door: typed calls to the aidream `/social`
 * router (contract: `aidream/aidream/services/social/FEATURE.md`). Only what
 * needs the server goes here — provider fetches, ingest, transcripts, the
 * analysis, the media playback door. Plain reads/edits are `./service.ts`.
 *
 * Every call names the BRAND's organization (carried by the brand context),
 * never the header's selection: the cost lands on that organization.
 *
 * The long doors (ingest, track, refresh) answer plain JSON today and are
 * being converted to the NDJSON stream; `callSocial` accepts BOTH, so the
 * progress callback lights up the day the stream lands with no UI change.
 */

import {
  del,
  downloadBlob,
  getJson,
  postJson,
  requestRaw,
} from "@/lib/python-client";
import { BackendApiError, parseHttpError } from "@/lib/api/errors";
import { parseMatrxNdjsonResponse } from "@ai-matrx/agents/matrx";

import type {
  AnalyzePostResult,
  IngestPostResult,
  IngestProfileResult,
  PostMediaRef,
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
  "organization_required",
];

/** The server's `detail.code`, wherever the shared error parser left it. */
export function socialErrorCode(error: unknown): SocialErrorCode | null {
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
  if (code === "social_provider_failed") return "The data provider failed. Retry in a moment.";
  if (code === "social_not_found") return "That account or post was not found.";
  if (code === "social_unsupported") return "That platform or link is not supported yet.";
  if (code === "social_not_configured") return "That provider is not set up.";
  if (error instanceof BackendApiError && error.userMessage) return error.userMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Progress text from a stream event, whatever its exact envelope. */
function progressOf(evt: unknown): SocialProgress | null {
  if (!evt || typeof evt !== "object") return null;
  const e = evt as { event?: string; data?: Record<string, unknown> };
  const d = e.data;
  if (!d || typeof d !== "object") return null;
  const type = typeof d.type === "string" ? d.type : e.event;
  if (type !== "progress" && type !== "status" && type !== "step") return null;
  const message =
    (typeof d.message === "string" && d.message) ||
    (typeof d.label === "string" && d.label) ||
    (typeof d.step === "string" && d.step) ||
    "";
  if (!message) return null;
  return {
    message,
    step: typeof d.current === "number" ? d.current : undefined,
    total: typeof d.total === "number" ? d.total : undefined,
  };
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
  let result: unknown = null;
  const parsed = parseMatrxNdjsonResponse(response, opts.signal);
  for await (const evt of parsed.events) {
    const progress = progressOf(evt);
    if (progress) opts.onProgress?.(progress);
    const e = evt as { event?: string; data?: Record<string, unknown> };
    if (e.event === "error") {
      throw new Error(
        typeof e.data?.user_message === "string" ? e.data.user_message : "The social call failed.",
      );
    }
    if (e.event === "data" && e.data && !progress) {
      result = "result" in e.data ? e.data.result : e.data;
    }
  }
  if (result === null) throw new Error("The social call ended without an answer.");
  return result as T;
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
  opts: CallOptions,
): Promise<string> {
  const path = door.startsWith("/") ? door : `/${door}`;
  const { blob } = await downloadBlob(path.startsWith(BASE) ? path : `${BASE}${path}`, {
    organizationId: org(opts.organizationId),
    signal: opts.signal,
  });
  return URL.createObjectURL(blob);
}

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
  item: { itemType: "social_post" | "social_ad" | "social_profile"; itemId: string },
  opts: CallOptions,
): Promise<void> {
  await postJson(
    `${BASE}/collections/${collectionId}/items`,
    { item_type: item.itemType, item_id: item.itemId },
    { organizationId: org(opts.organizationId), signal: opts.signal },
  );
}
