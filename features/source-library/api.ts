/**
 * The Media Source Catalog client — every call the screen makes to the server.
 *
 * Contract: ../../../common-docs/projects/media-source-catalog/API-CONTRACT.md (0.1.0).
 * Everything goes through `callApi`, the ONE door to the Python server, so auth,
 * base-URL resolution, organization scope, error capture and the NDJSON reader
 * are the platform's and not this feature's. Paths are typed through
 * ./contract-paths.ts until `pnpm sync-types` supplies the generated ones.
 *
 * WHY THE CATALOG READS THROUGH THE SERVER AND NOT SUPABASE. House rule is that
 * rows go direct to Supabase. Here the row set behind a Library is a join of
 * `research.youtube_video` through `platform.associations`, ordered and faceted
 * by fields the contract computes (media_kind, caption coverage, transcript
 * status) — and the server lane owns the `media.*` schema and its scoped list
 * RPC. The contract publishes `GET …/videos` as "the MOUNT READ — a client never
 * depends on having caught the stream" (§4.2) and `GET /media/libraries` as the
 * list; those ARE the declared read path for this primitive. A direct-Supabase
 * list RPC is requested in the contract's Frontend requests section and this
 * module moves to it in one place, the service triple, the day it exists.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { ApiCallError } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import "./contract-paths";

import type {
    ActionDeclaration,
    CreateJobRequest,
    EstimateRequest,
    EstimateResult,
    JobDetailResponse,
    JobEvent,
    JobItemStatus,
    JobRow,
    LibraryListResponse,
    LibraryMetrics,
    LibraryRow,
    LibraryVisibility,
    MediaAdapter,
    MediaErrorDetail,
    MediaSettingsResponse,
    ResolveResult,
    SyncEvent,
    VideoListResponse,
    VideoQuery,
} from "./types";

/**
 * A server refusal the screen can print as-is.
 *
 * The contract promises a SENTENCE on every failure (§1) and this class is
 * where that promise is kept on the client: a call that fails never hands the
 * UI a code, and never hands it an empty string to paper over with invented
 * copy. When the server did not supply one, the transport's own message is used
 * and `hasServerSentence` says so, so a surface can tell "the server explained"
 * from "we are guessing at why".
 */
export class MediaApiError extends Error {
    readonly code: string;
    readonly remedy: string | null;
    readonly retryable: boolean;
    readonly status: number | undefined;
    readonly hasServerSentence: boolean;

    constructor(detail: MediaErrorDetail, status?: number, hasServerSentence = true) {
        super(detail.message);
        this.name = "MediaApiError";
        this.code = detail.code;
        this.remedy = detail.remedy ?? null;
        this.retryable = detail.retryable ?? false;
        this.status = status;
        this.hasServerSentence = hasServerSentence;
    }
}

function isMediaErrorDetail(value: unknown): value is MediaErrorDetail {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.message === "string" && typeof candidate.code === "string";
}

/** Unwrap the platform error envelope into a sentence, or say we have none. */
export function toMediaError(error: ApiCallError): MediaApiError {
    const detail = error.serverDetail;
    if (isMediaErrorDetail(detail)) {
        return new MediaApiError(detail, error.status);
    }
    if (detail && typeof detail === "object" && "detail" in detail) {
        const inner = (detail as { detail: unknown }).detail;
        if (isMediaErrorDetail(inner)) {
            return new MediaApiError(inner, error.status);
        }
    }
    return new MediaApiError(
        {
            message:
                error.message ||
                "The server did not say why this failed. Try again, and tell an operator if it keeps happening.",
            code: error.code ?? error.type,
            remedy: null,
            retryable: error.type === "network_error",
        },
        error.status,
        false,
    );
}

function unwrap<T>(result: { data?: unknown; error?: ApiCallError }): T {
    if (result.error) throw toMediaError(result.error);
    return result.data as T;
}

// ───────────────────────────────────────────────────────────── §2 resolve ──

export async function resolveMediaInput(
    dispatch: AppDispatch,
    input: string,
    adapter?: MediaAdapter,
): Promise<ResolveResult> {
    const result = await dispatch(
        callApi({
            path: "/media/resolve",
            method: "POST",
            body: { input, adapter: adapter ?? null },
            expectedErrorStatuses: [400, 404, 422],
            connectTimeoutMs: 30_000,
        }),
    );
    return unwrap<ResolveResult>(result);
}

// ─────────────────────────────────────────────────────────── §3 libraries ──

export interface CreateLibraryInput {
    input: string;
    adapter?: MediaAdapter;
    name?: string;
    description?: string;
    visibility?: LibraryVisibility;
    organizationId?: string;
    settings?: Record<string, unknown>;
}

export async function createLibrary(
    dispatch: AppDispatch,
    input: CreateLibraryInput,
): Promise<LibraryRow> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries",
            method: "POST",
            body: {
                input: input.input,
                adapter: input.adapter ?? null,
                name: input.name ?? null,
                description: input.description ?? null,
                visibility: input.visibility ?? "private",
                organization_id: input.organizationId ?? null,
                settings: input.settings ?? null,
                // Enumeration is its own streaming call — never hidden inside create.
                sync_now: false,
            },
            expectedErrorStatuses: [400, 404, 422],
            connectTimeoutMs: 30_000,
        }),
    );
    return unwrap<LibraryRow>(result);
}

export interface LibraryListQuery {
    visibility?: LibraryVisibility[];
    adapter?: MediaAdapter;
    q?: string;
    limit?: number;
    offset?: number;
}

export async function listLibraries(
    dispatch: AppDispatch,
    query: LibraryListQuery = {},
): Promise<LibraryListResponse> {
    const params: Record<string, string | number | boolean> = {};
    if (query.visibility?.length) params.visibility = query.visibility.join(",");
    if (query.adapter) params.adapter = query.adapter;
    if (query.q) params.q = query.q;
    params.limit = query.limit ?? 50;
    params.offset = query.offset ?? 0;

    const result = await dispatch(
        callApi({
            path: "/media/libraries",
            method: "GET",
            queryParams: params,
        }),
    );
    return unwrap<LibraryListResponse>(result);
}

export async function getLibrary(
    dispatch: AppDispatch,
    libraryId: string,
): Promise<LibraryRow> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries/{library_id}",
            method: "GET",
            pathParams: { library_id: libraryId },
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<LibraryRow>(result);
}

export async function updateLibrary(
    dispatch: AppDispatch,
    libraryId: string,
    patch: {
        name?: string;
        description?: string | null;
        visibility?: LibraryVisibility;
        settings?: Record<string, unknown>;
    },
): Promise<LibraryRow> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}", "PATCH">({
            path: "/media/libraries/{library_id}",
            method: "PATCH",
            pathParams: { library_id: libraryId },
            body: patch,
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<LibraryRow>(result);
}

export async function deleteLibrary(
    dispatch: AppDispatch,
    libraryId: string,
): Promise<void> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries/{library_id}",
            method: "DELETE",
            pathParams: { library_id: libraryId },
            expectedErrorStatuses: [404],
        }),
    );
    if (result.error) throw toMediaError(result.error);
}

// ──────────────────────────────────────────────────────── §4 sync stream ──

/**
 * Narrow one platform stream envelope to a catalog event.
 *
 * The sync stream carries the platform's ordinary emitter traffic (phase,
 * warning, error, end) alongside this feature's typed `data` payloads, exactly
 * as the contract says (§4.1). Anything that is not one of ours is ignored here
 * and still reaches the platform's own capture inside the parser.
 */
export function asSyncEvent(event: TypedStreamEvent): SyncEvent | null {
    if (event.event !== "data") return null;
    const payload = event.data as unknown as { type?: unknown };
    if (typeof payload?.type !== "string") return null;
    if (!payload.type.startsWith("library.sync.") && payload.type !== "classify.completed") {
        return null;
    }
    return payload as unknown as SyncEvent;
}

export function asJobEvent(event: TypedStreamEvent): JobEvent | null {
    if (event.event !== "data") return null;
    const payload = event.data as unknown as { type?: unknown };
    if (typeof payload?.type !== "string") return null;
    if (!payload.type.startsWith("job.")) return null;
    return payload as unknown as JobEvent;
}

export interface SyncOptions {
    mode?: "full" | "incremental";
    classify?: boolean;
    signal?: AbortSignal;
    onEvent: (event: SyncEvent) => void;
}

/**
 * Start (or "bring up to date") the enumeration of a Library, streaming.
 *
 * Disconnecting does not stop the server — the rows are there on the mount read
 * (§4.2), which is what a reload or a closed tab falls back to.
 */
export async function syncLibrary(
    dispatch: AppDispatch,
    libraryId: string,
    options: SyncOptions,
): Promise<void> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}/sync", "POST">({
            path: "/media/libraries/{library_id}/sync",
            method: "POST",
            pathParams: { library_id: libraryId },
            body: {
                mode: options.mode ?? "full",
                classify: options.classify ?? true,
                stream: true,
            },
            stream: true,
            ...(options.signal ? { signal: options.signal } : {}),
            onStreamEvent: (event) => {
                const parsed = asSyncEvent(event);
                if (parsed) options.onEvent(parsed);
            },
            expectedErrorStatuses: [404, 409],
        }),
    );
    if (result.error) throw toMediaError(result.error);
}

export async function classifyLibrary(
    dispatch: AppDispatch,
    libraryId: string,
    options: {
        videoIds?: string[] | null;
        force?: boolean;
        shortsThresholdSeconds?: number;
        signal?: AbortSignal;
        onEvent?: (event: SyncEvent) => void;
    } = {},
): Promise<void> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}/classify", "POST">({
            path: "/media/libraries/{library_id}/classify",
            method: "POST",
            pathParams: { library_id: libraryId },
            body: {
                video_ids: options.videoIds ?? null,
                force: options.force ?? false,
                shorts_threshold_seconds: options.shortsThresholdSeconds ?? null,
            },
            stream: true,
            ...(options.signal ? { signal: options.signal } : {}),
            onStreamEvent: (event) => {
                const parsed = asSyncEvent(event);
                if (parsed && options.onEvent) options.onEvent(parsed);
            },
            expectedErrorStatuses: [404],
        }),
    );
    if (result.error) throw toMediaError(result.error);
}

// ───────────────────────────────────────────── §4.2 videos — the mount read ──

export function videoQueryParams(
    query: VideoQuery,
): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    if (query.media_kind?.length) params.media_kind = query.media_kind.join(",");
    if (query.has_captions !== undefined) params.has_captions = query.has_captions;
    if (query.transcript_status?.length) {
        params.transcript_status = query.transcript_status.join(",");
    }
    if (query.published_after) params.published_after = query.published_after;
    if (query.published_before) params.published_before = query.published_before;
    if (query.min_duration_seconds !== undefined) {
        params.min_duration_seconds = query.min_duration_seconds;
    }
    if (query.max_duration_seconds !== undefined) {
        params.max_duration_seconds = query.max_duration_seconds;
    }
    if (query.q) params.q = query.q;
    if (query.order) params.order = query.order;
    if (query.direction) params.direction = query.direction;
    if (query.limit !== undefined) params.limit = query.limit;
    if (query.offset !== undefined) params.offset = query.offset;
    return params;
}

export async function listVideos(
    dispatch: AppDispatch,
    libraryId: string,
    query: VideoQuery = {},
): Promise<VideoListResponse> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries/{library_id}/videos",
            method: "GET",
            pathParams: { library_id: libraryId },
            queryParams: videoQueryParams(query),
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<VideoListResponse>(result);
}

export async function getLibraryMetrics(
    dispatch: AppDispatch,
    libraryId: string,
    query: VideoQuery = {},
): Promise<LibraryMetrics> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries/{library_id}/metrics",
            method: "GET",
            pathParams: { library_id: libraryId },
            queryParams: videoQueryParams(query),
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<LibraryMetrics>(result);
}

// ────────────────────────────────────────────── §7 estimate, jobs, actions ──

export async function estimateAction(
    dispatch: AppDispatch,
    libraryId: string,
    request: EstimateRequest,
): Promise<EstimateResult> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}/estimate", "POST">({
            path: "/media/libraries/{library_id}/estimate",
            method: "POST",
            pathParams: { library_id: libraryId },
            body: request,
            expectedErrorStatuses: [400, 404, 409, 422],
            connectTimeoutMs: 60_000,
        }),
    );
    return unwrap<EstimateResult>(result);
}

export async function createJob(
    dispatch: AppDispatch,
    libraryId: string,
    request: CreateJobRequest,
): Promise<JobRow> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}/jobs", "POST">({
            path: "/media/libraries/{library_id}/jobs",
            method: "POST",
            pathParams: { library_id: libraryId },
            body: request,
            expectedErrorStatuses: [400, 402, 404, 409, 422],
            connectTimeoutMs: 60_000,
        }),
    );
    return unwrap<JobRow>(result);
}

export async function getJob(
    dispatch: AppDispatch,
    jobId: string,
    options: { status?: JobItemStatus[]; limit?: number; offset?: number } = {},
): Promise<JobDetailResponse> {
    const params: Record<string, string | number | boolean> = {};
    if (options.status?.length) params.status = options.status.join(",");
    params.limit = options.limit ?? 200;
    params.offset = options.offset ?? 0;

    const result = await dispatch(
        callApi({
            path: "/media/jobs/{job_id}",
            method: "GET",
            pathParams: { job_id: jobId },
            queryParams: params,
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<JobDetailResponse>(result);
}

export async function streamJob(
    dispatch: AppDispatch,
    jobId: string,
    options: { signal?: AbortSignal; onEvent: (event: JobEvent) => void },
): Promise<void> {
    const result = await dispatch(
        callApi({
            path: "/media/jobs/{job_id}/stream",
            method: "GET",
            pathParams: { job_id: jobId },
            stream: true,
            ...(options.signal ? { signal: options.signal } : {}),
            onStreamEvent: (event) => {
                const parsed = asJobEvent(event);
                if (parsed) options.onEvent(parsed);
            },
            expectedErrorStatuses: [404],
        }),
    );
    if (result.error) throw toMediaError(result.error);
}

export async function resumeJob(
    dispatch: AppDispatch,
    jobId: string,
): Promise<{ job: JobRow; reclaimed: number }> {
    const result = await dispatch(
        callApi({
            path: "/media/jobs/{job_id}/resume",
            method: "POST",
            pathParams: { job_id: jobId },
            expectedErrorStatuses: [404],
        }),
    );
    return unwrap<{ job: JobRow; reclaimed: number }>(result);
}

export async function retryFailedJobItems(
    dispatch: AppDispatch,
    jobId: string,
): Promise<{ job: JobRow; requeued: number }> {
    const result = await dispatch(
        callApi({
            path: "/media/jobs/{job_id}/retry-failed",
            method: "POST",
            pathParams: { job_id: jobId },
            expectedErrorStatuses: [400, 404, 409],
        }),
    );
    return unwrap<{ job: JobRow; requeued: number }>(result);
}

export async function cancelJob(dispatch: AppDispatch, jobId: string): Promise<JobRow> {
    const result = await dispatch(
        callApi({
            path: "/media/jobs/{job_id}/cancel",
            method: "POST",
            pathParams: { job_id: jobId },
            expectedErrorStatuses: [404, 409],
        }),
    );
    return unwrap<JobRow>(result);
}

/**
 * §8 — the Action registry.
 *
 * The action bar renders whatever this returns. One declaration server-side is
 * enough to appear on the screen; nothing about an action is hardcoded here.
 */
export async function listActions(dispatch: AppDispatch): Promise<ActionDeclaration[]> {
    const result = await dispatch(
        callApi({ path: "/media/actions", method: "GET" }),
    );
    return unwrap<{ actions: ActionDeclaration[] }>(result).actions;
}

// ────────────────────────────────────────────────────────────── §9 settings ──

export async function getMediaSettings(
    dispatch: AppDispatch,
    libraryId?: string,
): Promise<MediaSettingsResponse> {
    const result = await dispatch(
        callApi({
            path: "/media/settings",
            method: "GET",
            ...(libraryId ? { queryParams: { library_id: libraryId } } : {}),
        }),
    );
    return unwrap<MediaSettingsResponse>(result);
}

export async function putMediaSettings(
    dispatch: AppDispatch,
    scope: "org" | "library",
    values: Record<string, unknown>,
    libraryId?: string,
): Promise<MediaSettingsResponse> {
    const result = await dispatch(
        callApi({
            path: "/media/settings",
            method: "PUT",
            body: { scope, library_id: libraryId ?? null, values },
            expectedErrorStatuses: [400, 404, 422],
        }),
    );
    return unwrap<MediaSettingsResponse>(result);
}
