/**
 * The live half of the Media Source Catalog: what a sync is doing right now,
 * what a job is doing right now, and the rows and metrics they produced.
 *
 * WHY THIS IS REDUX AND NOT COMPONENT STATE. A sync of a 1,000-video channel
 * outlives the component that started it — a person pastes a channel, walks to
 * another page and comes back, and the count must still be moving. A job
 * outlives the tab entirely. So the stream writes HERE, and every viewer reads
 * the same numbers.
 *
 * 🚨 THIS SLICE IS A CACHE, NEVER THE TRUTH. The durable truth is the server:
 * `GET …/videos` is the mount read (§4.2) and `GET /media/jobs/{id}` is the job
 * mount read (§7). Nothing in here is persisted, and every screen that shows
 * job state reads the rows on mount before it trusts a single stream event —
 * that is what makes a reload mid-job lose nothing.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
    JobItemRow,
    JobRow,
    LibraryMetrics,
    LibraryRow,
    SyncEvent,
    VideoRow,
} from "../types";

export type SyncPhase = "idle" | "starting" | "listing" | "done" | "unavailable" | "failed";

export interface SyncState {
    phase: SyncPhase;
    /** Epoch ms the request left the client — the elapsed clock's origin. */
    startedAt: number | null;
    /** Server-reported elapsed at the terminal event, so the final number is its. */
    finishedElapsedMs: number | null;
    listed: number;
    /** How many pages the walk discarded, and why. See the "done" banner. */
    skippedTotal: number;
    skippedByReason: Record<string, number>;
    /** How many Sources this run actually retired. See the "done" banner. */
    removedCount: number;
    /**
     * True when a full sync would have retired ≥50% of what it just
     * persisted and the server refused rather than removing anything — the
     * Library kept every Source it had. `removedCount` reads 0 either way,
     * so this is the only thing that tells the "done" banner which one
     * happened.
     */
    retireRefused: boolean;
    expectedTotal: number | null;
    pagesReceived: number;
    operationId: string | null;
    /** A sentence, always. Never a code. */
    message: string | null;
    remedy: string | null;
    retryable: boolean;
    /** What the client still holds when a sync stopped early. */
    partialTotal: number | null;
    quotaUnitsSpent: number | null;
    /**
     * Updates that arrived during this run and could not be read, each already
     * a sentence. 🚨 NOT A FAILURE AND NOT A SILENCE: the run continues on the
     * server, so the strip keeps counting AND says what it could not read,
     * rather than dying on a malformed event or dropping it without a word.
     */
    problems: string[];
}

const EMPTY_SYNC: SyncState = {
    phase: "idle",
    startedAt: null,
    finishedElapsedMs: null,
    listed: 0,
    skippedTotal: 0,
    skippedByReason: {},
    removedCount: 0,
    retireRefused: false,
    expectedTotal: null,
    pagesReceived: 0,
    operationId: null,
    message: null,
    remedy: null,
    retryable: false,
    partialTotal: null,
    quotaUnitsSpent: null,
    problems: [],
};

export interface LibraryLiveState {
    library: LibraryRow | null;
    sync: SyncState;
    metrics: LibraryMetrics | null;
    /** Rows the STREAM produced, newest page last. The mount read owns the list
     *  the table renders; these exist so rows appear while enumeration runs. */
    streamedVideos: VideoRow[];
    /** Job ids this library started or loaded, newest first. */
    jobIds: string[];
}

export interface JobLiveState {
    job: JobRow | null;
    items: Record<string, JobItemRow>;
    itemOrder: string[];
    /** Epoch ms of the client's own attach, for the panel's moving clock. */
    attachedAt: number | null;
    elapsedMs: number | null;
    etaSeconds: number | null;
    /** True once the mount read answered — a panel may not claim "nothing yet"
     *  before this, exactly as a list may not say "none" while it is loading. */
    loadedFromServer: boolean;
    error: string | null;
    /** One honest sentence per item the mount read could not narrow — see
     *  `JobDetailResponse.row_problems` (`lib/contract/narrow.ts`'s
     *  `mapListRows`). Never taken as "no items". */
    rowProblems: string[];
}

interface SourceLibraryState {
    byLibraryId: Record<string, LibraryLiveState>;
    jobsById: Record<string, JobLiveState>;
}

const initialState: SourceLibraryState = { byLibraryId: {}, jobsById: {} };

function emptyLibrary(): LibraryLiveState {
    return {
        library: null,
        sync: { ...EMPTY_SYNC, problems: [] },
        metrics: null,
        streamedVideos: [],
        jobIds: [],
    };
}

function ensureLibrary(state: SourceLibraryState, libraryId: string): LibraryLiveState {
    if (!state.byLibraryId[libraryId]) {
        state.byLibraryId[libraryId] = emptyLibrary();
    }
    return state.byLibraryId[libraryId];
}

function emptyJob(): JobLiveState {
    return {
        job: null,
        items: {},
        itemOrder: [],
        attachedAt: null,
        elapsedMs: null,
        etaSeconds: null,
        loadedFromServer: false,
        error: null,
        rowProblems: [],
    };
}

function ensureJob(state: SourceLibraryState, jobId: string): JobLiveState {
    if (!state.jobsById[jobId]) {
        state.jobsById[jobId] = emptyJob();
    }
    return state.jobsById[jobId];
}

/**
 * Does this blob carry every section `LibraryMetricsHeader` reads? A partial
 * one is not "some metrics" — it is a crash waiting for the first tile.
 */
export function isRenderableMetrics(value: unknown): value is LibraryMetrics {
    if (!value || typeof value !== "object") return false;
    const m = value as Record<string, unknown>;
    const section = (key: string) =>
        typeof m[key] === "object" && m[key] !== null;
    return (
        typeof m.total === "number" &&
        section("counts_by_kind") &&
        section("length") &&
        section("length_by_kind") &&
        section("date_range") &&
        section("caption_coverage") &&
        section("transcripts") &&
        Array.isArray(m.cadence_per_month)
    );
}

const sourceLibrarySlice = createSlice({
    name: "sourceLibrary",
    initialState,
    reducers: {
        libraryLoaded(state, action: PayloadAction<LibraryRow>) {
            const entry = ensureLibrary(state, action.payload.id);
            entry.library = action.payload;
            // 🚨 A JSONB COLUMN IS NOT A TYPE. `library.metrics` is whatever the
            // last sync happened to write into `media.source_library.metrics`,
            // including a shape from an older build or a half-written one from a
            // run that then failed. Adopting it blind is how the TED Library
            // crashed the page a second time on 2026-09-17, reading
            // `length_by_kind.long` off undefined. Only a blob that carries the
            // sections this screen reads is treated as metrics; anything else
            // leaves `metrics` null, and the real `GET …/metrics` read — or its
            // honest failure — is what the header renders.
            if (isRenderableMetrics(action.payload.metrics)) {
                entry.metrics = action.payload.metrics;
            }
        },

        metricsLoaded(
            state,
            action: PayloadAction<{ libraryId: string; metrics: LibraryMetrics }>,
        ) {
            ensureLibrary(state, action.payload.libraryId).metrics = action.payload.metrics;
        },

        /** The client's own origin for the elapsed clock — set before the fetch. */
        syncRequested(
            state,
            action: PayloadAction<{ libraryId: string; startedAt: number }>,
        ) {
            const entry = ensureLibrary(state, action.payload.libraryId);
            entry.sync = {
                ...EMPTY_SYNC,
                problems: [],
                phase: "starting",
                startedAt: action.payload.startedAt,
            };
            entry.streamedVideos = [];
        },

        syncEvent(
            state,
            action: PayloadAction<{ libraryId: string; event: SyncEvent }>,
        ) {
            const entry = ensureLibrary(state, action.payload.libraryId);
            const event = action.payload.event;
            const sync = entry.sync;
            if ("operation_id" in event) sync.operationId = event.operation_id;

            switch (event.type) {
                case "library.sync.started":
                    sync.phase = "listing";
                    sync.expectedTotal = event.expected_total;
                    break;
                case "library.sync.page": {
                    sync.phase = "listing";
                    sync.pagesReceived += 1;
                    sync.listed = event.cumulative;
                    const seen = new Set(entry.streamedVideos.map((v) => v.id));
                    for (const video of event.videos) {
                        if (!seen.has(video.id)) entry.streamedVideos.push(video);
                    }
                    break;
                }
                case "library.sync.classified": {
                    const byId = new Map(
                        event.classifications.map((c) => [c.video_id, c]),
                    );
                    for (const video of entry.streamedVideos) {
                        const classification = byId.get(video.id);
                        if (classification) {
                            video.media_kind = classification.media_kind;
                            video.media_kind_signal = classification.media_kind_signal;
                        }
                    }
                    break;
                }
                case "library.sync.progress":
                    sync.listed = Math.max(sync.listed, event.listed);
                    if (event.expected_total != null) {
                        sync.expectedTotal = event.expected_total;
                    }
                    break;
                case "library.sync.metrics":
                    entry.metrics = event.metrics;
                    break;
                case "library.sync.completed":
                    sync.phase = "done";
                    sync.listed = event.total_listed;
                    sync.finishedElapsedMs = event.elapsed_ms;
                    sync.quotaUnitsSpent = event.quota_units_spent;
                    sync.skippedTotal = event.skipped_total;
                    sync.skippedByReason = event.skipped_by_reason;
                    sync.removedCount = event.removed_count;
                    sync.retireRefused = event.retire_refused;
                    entry.metrics = event.metrics;
                    if (entry.library) {
                        entry.library.sync_status = "idle";
                        entry.library.sync_error = null;
                        entry.library.item_count = event.total_listed;
                    }
                    break;
                case "library.sync.unavailable":
                    sync.phase = "unavailable";
                    sync.message = event.message;
                    sync.remedy = event.remedy;
                    sync.retryable = false;
                    sync.partialTotal = event.partial_total;
                    break;
                case "library.sync.failed":
                    sync.phase = "failed";
                    sync.message = event.message;
                    sync.retryable = event.retryable;
                    sync.partialTotal = event.partial_total;
                    if (entry.library) {
                        entry.library.sync_status = "failed";
                        entry.library.sync_error = event.message;
                    }
                    break;
                case "classify.completed":
                    break;
            }
        },

        /**
         * The transport died before a terminal event. Not a failed sync: aidream
         * detaches on disconnect, so the run is very likely still completing and
         * the mount read is what settles it (§4).
         */
        syncTransportLost(
            state,
            action: PayloadAction<{ libraryId: string; message: string }>,
        ) {
            const sync = ensureLibrary(state, action.payload.libraryId).sync;
            if (sync.phase === "starting" || sync.phase === "listing") {
                sync.phase = "failed";
                sync.retryable = true;
                sync.message = action.payload.message;
            }
        },

        /** One update this client could not read, during a run that continues. */
        syncProblem(
            state,
            action: PayloadAction<{ libraryId: string; message: string }>,
        ) {
            const sync = ensureLibrary(state, action.payload.libraryId).sync;
            if (!sync.problems.includes(action.payload.message)) {
                sync.problems.push(action.payload.message);
            }
        },

        syncDismissed(state, action: PayloadAction<string>) {
            ensureLibrary(state, action.payload).sync = { ...EMPTY_SYNC, problems: [] };
        },

        /** The mount read landed — the truth every stream event is reconciled to. */
        jobLoaded(
            state,
            action: PayloadAction<{
                job: JobRow;
                items: JobItemRow[];
                rowProblems?: string[];
            }>,
        ) {
            const entry = ensureJob(state, action.payload.job.id);
            entry.job = action.payload.job;
            entry.loadedFromServer = true;
            entry.error = null;
            entry.rowProblems = action.payload.rowProblems ?? [];
            for (const item of action.payload.items) {
                if (!entry.items[item.id]) entry.itemOrder.push(item.id);
                entry.items[item.id] = item;
            }
            const library = ensureLibrary(state, action.payload.job.library_id);
            if (!library.jobIds.includes(action.payload.job.id)) {
                library.jobIds.unshift(action.payload.job.id);
            }
        },

        jobLoadFailed(
            state,
            action: PayloadAction<{ jobId: string; message: string }>,
        ) {
            const entry = ensureJob(state, action.payload.jobId);
            entry.error = action.payload.message;
        },

        jobAttached(
            state,
            action: PayloadAction<{ jobId: string; attachedAt: number }>,
        ) {
            ensureJob(state, action.payload.jobId).attachedAt = action.payload.attachedAt;
        },

        jobRowUpdated(state, action: PayloadAction<JobRow>) {
            const entry = ensureJob(state, action.payload.id);
            entry.job = action.payload;
        },

        jobItemUpdated(
            state,
            action: PayloadAction<{ jobId: string; item: JobItemRow }>,
        ) {
            const entry = ensureJob(state, action.payload.jobId);
            const item = action.payload.item;
            if (!entry.items[item.id]) entry.itemOrder.push(item.id);
            entry.items[item.id] = item;
        },

        jobProgress(
            state,
            action: PayloadAction<{
                jobId: string;
                totals: JobRow["totals"];
                progressPercent: number;
                elapsedMs: number;
                etaSeconds: number | null;
            }>,
        ) {
            const entry = ensureJob(state, action.payload.jobId);
            entry.elapsedMs = action.payload.elapsedMs;
            entry.etaSeconds = action.payload.etaSeconds;
            if (entry.job) {
                entry.job.totals = action.payload.totals;
                entry.job.progress_percent = action.payload.progressPercent;
            }
        },
    },
});

export const {
    libraryLoaded,
    metricsLoaded,
    syncRequested,
    syncEvent,
    syncProblem,
    syncTransportLost,
    syncDismissed,
    jobLoaded,
    jobLoadFailed,
    jobAttached,
    jobRowUpdated,
    jobItemUpdated,
    jobProgress,
} = sourceLibrarySlice.actions;

export default sourceLibrarySlice.reducer;

// ───────────────────────────────────────────────────────────────── selectors ──

const selectSlice = (state: RootState) => state.sourceLibrary;

export const selectLibraryLive = createSelector(
    [selectSlice, (_: RootState, libraryId: string) => libraryId],
    (slice, libraryId): LibraryLiveState | null => slice.byLibraryId[libraryId] ?? null,
);

export const selectLibrarySync = createSelector(
    [selectLibraryLive],
    (entry): SyncState => entry?.sync ?? EMPTY_SYNC,
);

export const selectLibraryMetrics = createSelector(
    [selectLibraryLive],
    (entry): LibraryMetrics | null => entry?.metrics ?? null,
);

export const selectStreamedVideos = createSelector(
    [selectLibraryLive],
    (entry): VideoRow[] => entry?.streamedVideos ?? EMPTY_VIDEOS,
);

export const selectLibraryJobIds = createSelector(
    [selectLibraryLive],
    (entry): string[] => entry?.jobIds ?? EMPTY_IDS,
);

export const selectJobLive = createSelector(
    [selectSlice, (_: RootState, jobId: string) => jobId],
    (slice, jobId): JobLiveState | null => slice.jobsById[jobId] ?? null,
);

export const selectJobItems = createSelector([selectJobLive], (entry): JobItemRow[] => {
    if (!entry) return EMPTY_ITEMS;
    return entry.itemOrder.map((id) => entry.items[id]).filter(Boolean);
});

export const selectJobRowProblems = createSelector(
    [selectJobLive],
    (entry): string[] => entry?.rowProblems ?? EMPTY_ROW_PROBLEMS,
);

const EMPTY_VIDEOS: VideoRow[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_ITEMS: JobItemRow[] = [];
const EMPTY_ROW_PROBLEMS: string[] = [];
