/**
 * The Media Source Catalog client — every call the screen makes to the server.
 *
 * Contract: ../../../common-docs/projects/media-source-catalog/API-CONTRACT.md (0.1.0).
 * Everything goes through `callApi`, the ONE door to the Python server, so auth,
 * base-URL resolution, organization scope, error capture and the NDJSON reader
 * are the platform's and not this feature's. Paths and bodies are typed by the
 * GENERATED contract (`types/python-generated/api-types.ts`): the `/media/*`
 * operations landed there on 2026-09-18 and the contract-ahead augmentation
 * that stood in for them deleted itself, exactly as its header promised. What
 * that generated contract does NOT carry, this file no longer calls — see the
 * note above `syncLibrary`.
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
import {
    MediaApiError,
    parseActionList,
    parseEstimateResult,
    parseJobAndCount,
    parseJobDetailResponse,
    parseJobListResponse,
    parseJobEvent,
    parseJobRow,
    parseLibraryListResponse,
    parseLibraryRow,
    parseMediaSettingsResponse,
    parseMetricsResponse,
    parseResolveResult,
    parseSyncEvent,
    parseVideoListResponse,
} from "./contract";
import type { Parsed } from "@/lib/contract/narrow";

import type {
    ActionDeclaration,
    CreateJobRequest,
    EstimateRequest,
    EstimateResult,
    JobDetailResponse,
    JobListResponse,
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
 * The refusal class and every shape parser live in `./contract`.
 *
 * 🚨 EVERY RESPONSE IS NARROWED, NEVER ASSERTED. `unwrap<T>()` used to be
 * `return result.data as T` — a cast, not a check — on the return path of
 * nearly every function in this file, while `JobPanel` rendered `item.title`
 * and `item.attempt` straight into JSX. That is the exact hole that took
 * `/exports` to the global error boundary on 2026-09-17 when one server key
 * turned from a count into a list. Nothing below returns a value a parser did
 * not build. `MediaApiError` is re-exported so every existing importer of it
 * reads the same.
 */
export { MediaApiError, MediaContractError } from "./contract";

/**
 * 🚨 "NOT YET" IS NOT "NO", AND IT IS NEVER A SENTENCE ON A SCREEN.
 *
 * The platform transport is fail-closed: it refuses any authenticated request
 * made before the active organization has resolved, with
 * `organization_context_required` — "Select an organization before sending
 * this request." That refusal is aimed at the DEVELOPER; the app context
 * resolves a beat after first render, so on a cold page load the first read
 * always trips it and the second read succeeds. Printing it is a lie twice
 * over: the person has an organization, and nothing is wrong. On 2026-09-18 an
 * independent re-test watched exactly that sentence sit on a Library page for
 * the whole visit, because the failure was recorded and the later success
 * never overwrote it.
 *
 * So callers gate their reads on a resolved organization AND treat this code
 * as "still starting", never as a failure worth a person's attention. A
 * genuinely org-less account is the platform's problem, not this feature's:
 * `callApi` opens the workspace picker for that case.
 */
export function isOrganizationNotReady(error: unknown): boolean {
    return (
        error instanceof MediaApiError &&
        (error.code === "organization_context_required" ||
            error.code === "organization_context_invalid")
    );
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

/**
 * The ONE return path: a refusal becomes a sentence, and a body becomes
 * whatever the parser could prove it is. There is no overload that skips the
 * parser — that was the defect.
 */
function read<T>(
    result: { data?: unknown; error?: ApiCallError },
    parse: (payload: unknown) => T,
): T {
    if (result.error) throw toMediaError(result.error);
    return parse(result.data);
}

/**
 * 🚨 THE SERVER WRAPS A SINGLE LIBRARY AND THE CONTRACT SAYS IT DOES NOT.
 *
 * `API-CONTRACT.md` §3 publishes "200 → Library row" for both
 * `POST /media/libraries` and `GET /media/libraries/{id}`. The running server
 * (build e09d986, 2026-09-17) returns `{"library": {…}, "resolved": {…}}` and
 * `{"library": {…}}` instead. Reading the envelope as the row is silent and
 * total: `library.id` is `undefined`, so the paste box navigates to
 * `/libraries/undefined`; `library.name` is `undefined`, so the header sits in
 * a skeleton forever and the failed-catalogue sentence on the row is never
 * rendered because the row never arrives. Reality is the referee, so this
 * accepts what the server actually sends AND the shape the contract promises —
 * whichever lands, the caller gets a row. The discrepancy is reported to the
 * server lane; this function is what stops it mattering.
 */
function asLibraryRow(payload: unknown): LibraryRow {
    if (payload && typeof payload === "object" && "library" in payload) {
        const inner = (payload as { library: unknown }).library;
        if (inner && typeof inner === "object") {
            return normalizeVisibility(parseLibraryRow(inner, "this Library"));
        }
    }
    return normalizeVisibility(parseLibraryRow(payload, "this Library"));
}

/**
 * 🚨 THE SAME DEFECT, ONE ENDPOINT OVER — AND THIS ONE COST MONEY.
 *
 * `POST /media/libraries/{id}/jobs` answered `{"job": {…}}` where §7.3 publishes a
 * bare Job row. The screen read `job.id`, got nothing, and said so honestly — but the
 * server had ALREADY accepted and started a real, billable paid transcription. The
 * person who confirmed "Spend up to $3.66 and start" had a running job their screen
 * could never find again: 0 running, 0 queued, twelve minutes later.
 *
 * The server is fixed (it returns the bare row, guarded by
 * `tests/test_media_catalog_wire_shapes.py`, which now walks EVERY documented endpoint
 * against the router). This stays anyway, for the same reason `asLibraryRow` does:
 * a client and a server deploy at different times, and during that window the shape
 * that arrives is whichever build answered. Reading both costs nothing; reading one
 * costs a person their money.
 */
function asJobRow(payload: unknown): JobRow {
    if (payload && typeof payload === "object" && "job" in payload) {
        const inner = (payload as { job: unknown }).job;
        if (inner && typeof inner === "object") return parseJobRow(inner, "this job");
    }
    return parseJobRow(payload, "this job");
}

/**
 * The server sends a PYTHON REPR for this field: `"Visibility.INTERNAL"`, not
 * `"internal"` — `str()` on an enum member rather than its `.value` (aidream
 * `api/routers/media_catalog.py`, `_library_row`). Every lane tab therefore
 * counts zero while rows sit in the table. Reported to the server lane; until
 * the wire is fixed this reads either spelling, because a Library that renders
 * in the wrong lane is better than one that renders in none.
 */
export function normalizeVisibility<T extends { visibility?: unknown }>(row: T): T {
    const raw = row?.visibility;
    if (typeof raw !== "string") return row;
    const tail = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
    const normalized = tail.toLowerCase();
    return normalized === raw ? row : { ...row, visibility: normalized };
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
    return read(result, parseResolveResult);
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
                visibility: input.visibility ?? "personal",
                // THE ORGANIZATION IS THE TRANSPORT'S, NOT THIS SCREEN'S.
                // `callApi` resolves the active organization once and binds it
                // to the body and the `X-Organization-Id` header together, so a
                // screen that names one here can only ever agree or conflict —
                // never inform. The key is written ONLY when a caller
                // deliberately overrides it; a bare `?? null` here is what made
                // every new channel intake fail with "Request body
                // organization_id must match the request context organization".
                ...(input.organizationId ? { organization_id: input.organizationId } : {}),
                settings: input.settings ?? null,
                // NO `sync_now`. Enumeration is its own streaming call and the
                // server never offered a way to fold it into creation:
                // `components["schemas"]["CreateLibraryBody"]` has exactly
                // input / adapter / name / description / visibility /
                // organization_id / settings. The key was invented by the
                // contract-ahead declaration and FastAPI dropped it on arrival.
            },
            expectedErrorStatuses: [400, 404, 422],
            connectTimeoutMs: 30_000,
        }),
    );
    return asLibraryRow(read(result, (payload) => payload));
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
    const response = read(result, parseLibraryListResponse);
    return {
        ...response,
        libraries: response.libraries.map(normalizeVisibility),
    };
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
    return asLibraryRow(read(result, (payload) => payload));
}

/**
 * 🚨 WHAT THIS MODULE NO LONGER CALLS, AND WHY (2026-09-18).
 *
 * `pnpm sync-types:live` replaced the contract-ahead declaration with the real
 * generated contract, and four endpoints this file called are not in it — and
 * never were in the router either. The server's own wire-shape table
 * (`aidream/tests/test_media_catalog_wire_shapes.py`) marks each one
 * `implemented: False`, and API-CONTRACT.md §0.5 "NOT working" says the same:
 *
 *   • `PATCH /media/libraries/{id}`  — §3, "Not implemented."
 *   • `DELETE /media/libraries/{id}` — §3, "Not implemented."
 *   • `POST …/classify`             — §6, "No separate endpoint. Classification
 *                                     runs inside every sync (`classify: true`,
 *                                     the default); re-sync to reclassify."
 *   • `GET /media/jobs/{id}/stream` — published in §7 but never built:
 *                                     "Progress rides the platform operation
 *                                     stream, not a /media path."
 *
 * So `updateLibrary`, `deleteLibrary`, `classifyLibrary` and `streamJob` are
 * gone rather than kept as callers of 404s — the same class as the Cancel
 * button §0.5 records, which the contract published and this file called for
 * the feature's whole life while no route served it. The one of them a person
 * could reach, Delete on the Library list, went with them. They come back the
 * day the server ships the routes and `pnpm sync-types` puts them in `paths`;
 * the gap is filed in FOUND_DEFECTS.md.
 */

// ──────────────────────────────────────────────────────── §4 sync stream ──

/**
 * Narrow one platform stream envelope to a catalog event.
 *
 * The sync stream carries the platform's ordinary emitter traffic (phase,
 * warning, error, end) alongside this feature's typed `data` payloads, exactly
 * as the contract says (§4.1). Anything that is not one of ours is ignored here
 * and still reaches the platform's own capture inside the parser.
 */
export function asSyncEvent(
    event: TypedStreamEvent,
    onProblem?: (message: string) => void,
): SyncEvent | null {
    if (event.event !== "data") return null;
    const standIns: string[] = [];
    const read = parseSyncEvent(event.data, standIns);
    for (const sentence of standIns) onProblem?.(sentence);
    if (read === null) return null;
    if ("problem" in read) {
        // 🚨 NEITHER SILENT NOR FATAL. Throwing here would abort the reader and
        // freeze a sync that is still running on the server; swallowing it
        // would leave a screen quietly missing a page of Sources. The sentence
        // goes to the caller, which shows it beside the progress.
        onProblem?.(read.problem);
        return null;
    }
    return read.event;
}

export function asJobEvent(
    event: TypedStreamEvent,
    onProblem?: (message: string) => void,
): JobEvent | null {
    if (event.event !== "data") return null;
    const read = parseJobEvent(event.data);
    if (read === null) return null;
    if ("problem" in read) {
        onProblem?.(read.problem);
        return null;
    }
    return read.event;
}

export interface SyncOptions {
    mode?: "full" | "incremental";
    classify?: boolean;
    signal?: AbortSignal;
    onEvent: (event: SyncEvent) => void;
    /** An update this screen could not read. The run continues; say so. */
    onProblem?: (message: string) => void;
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
                // NO `stream` key. `components["schemas"]["SyncBody"]` is
                // exactly { mode, classify }; the endpoint ALWAYS streams
                // NDJSON (the server answers it with
                // `create_streaming_response`), so asking for it was never a
                // choice the body could express. The `stream: true` below is
                // `callApi`'s own reader flag, which is a different thing.
            },
            stream: true,
            ...(options.signal ? { signal: options.signal } : {}),
            onStreamEvent: (event) => {
                const parsed = asSyncEvent(event, options.onProblem);
                if (parsed) options.onEvent(parsed);
            },
            expectedErrorStatuses: [404, 409],
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
    return read(result, parseVideoListResponse);
}

/**
 * §5 — the numbers behind the header.
 *
 * It returns `Parsed` rather than the metrics alone because two of them (the
 * caption coverage percentage and the total hours) are RECOVERABLE: both are
 * computable from figures printed beside them, so a server that mislabels one
 * must not cost a person the whole header. The stand-in announces itself —
 * `problems` carries the sentence and `LibraryPage` puts it on the screen.
 */
export async function getLibraryMetrics(
    dispatch: AppDispatch,
    libraryId: string,
    query: VideoQuery = {},
): Promise<Parsed<LibraryMetrics>> {
    const result = await dispatch(
        callApi({
            path: "/media/libraries/{library_id}/metrics",
            method: "GET",
            pathParams: { library_id: libraryId },
            queryParams: videoQueryParams(query),
            expectedErrorStatuses: [404],
        }),
    );
    return read(result, parseMetricsResponse);
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
    return read(result, parseEstimateResult);
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
    return read(result, asJobRow);
}

/**
 * `GET /media/libraries/{id}/jobs` — THE JOB-DISCOVERY DOOR.
 *
 * The server has published this since the feature shipped and nothing here called it.
 * It is how a durable job is found again when this browser does not know its id:
 * after a reload, on another device, or — the defect that made it urgent — when the
 * id never arrived at all because `POST …/jobs` answered in an envelope this screen
 * could not read. The job was real, running and already billed; the rows were in the
 * database the whole time; only the door was never opened.
 */
export async function listLibraryJobs(
    dispatch: AppDispatch,
    libraryId: string,
    options: { status?: JobRow["status"][]; limit?: number; offset?: number } = {},
): Promise<JobListResponse> {
    const result = await dispatch(
        callApi<"/media/libraries/{library_id}/jobs", "GET">({
            path: "/media/libraries/{library_id}/jobs",
            method: "GET",
            pathParams: { library_id: libraryId },
            queryParams: {
                ...(options.status?.length ? { status: options.status.join(",") } : {}),
                ...(options.limit === undefined ? {} : { limit: options.limit }),
                ...(options.offset === undefined ? {} : { offset: options.offset }),
            },
            expectedErrorStatuses: [404],
        }),
    );
    return read(result, parseJobListResponse);
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
    return read(result, parseJobDetailResponse);
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
    return read(result, (payload) => parseJobAndCount(payload, "reclaimed"));
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
    return read(result, (payload) => parseJobAndCount(payload, "requeued"));
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
    return read(result, parseJobRow);
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
    return read(result, parseActionList);
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
    return read(result, parseMediaSettingsResponse);
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
    return read(result, parseMediaSettingsResponse);
}
