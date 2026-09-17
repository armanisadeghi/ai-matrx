/**
 * Wire types for the Media Source Catalog.
 *
 * SoR: ../../../common-docs/projects/media-source-catalog/API-CONTRACT.md (contract 0.1.0).
 * The server lane owns that file; these types are its TypeScript face. When the contract
 * version moves, this file moves with it in the same session — never a local divergence.
 *
 * Canonical nouns only: Library, Source, Action. Nothing here coins a noun.
 */

export type MediaAdapter = "youtube" | "podcast_rss" | "drive_folder";
export type LibraryKind = "channel" | "playlist";
export type LibraryVisibility = "private" | "internal" | "shared" | "public";
export type LibrarySyncStatus = "never_synced" | "syncing" | "idle" | "failed";

export type MediaKind = "long" | "short" | "live" | "unknown";
export type MediaKindSignal = "duration" | "shorts_url" | "live_broadcast" | "unknown";
export type TranscriptStatus = "none" | "queued" | "running" | "ready" | "failed" | "skipped";
export type TranscriptLane = "free_captions" | "paid_agent";

export type JobStatus =
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "completed_with_failures"
    | "failed"
    | "cancelled";

export type JobItemStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";

/** §1 — every failure carries a sentence, never a code alone. */
export type MediaErrorCode =
    | "youtube_key_missing"
    | "youtube_quota_exhausted"
    | "input_unresolvable"
    | "library_not_found"
    | "job_not_found"
    | "estimate_required"
    | "estimate_stale"
    | "adapter_unsupported"
    | "selection_empty";

export interface MediaErrorDetail {
    message: string;
    code: MediaErrorCode | string;
    remedy?: string | null;
    retryable?: boolean;
}

/** §2 — POST /media/resolve */
export interface ResolveResult {
    adapter: MediaAdapter;
    kind: LibraryKind;
    external_id: string;
    uploads_playlist_id: string | null;
    title: string;
    handle: string | null;
    description: string | null;
    thumbnail_url: string | null;
    published_at: string | null;
    item_count: number | null;
    subscriber_count: number | null;
    view_count: number | null;
    resolved_from:
        | "channel_id"
        | "handle"
        | "legacy_user"
        | "custom_url"
        | "playlist_id"
        | "video_id";
    canonical_url: string;
    existing_library_id: string | null;
}

/** §5 — GET /media/libraries/{id}/metrics */
export interface LibraryMetrics {
    computed_at: string;
    library_id: string;
    total: number;
    counts_by_kind: Record<MediaKind, number>;
    date_range: { earliest: string | null; latest: string | null; span_days: number | null };
    cadence_per_month: Array<{ period: string; count: number; seconds: number }>;
    cadence_per_year: Array<{ period: string; count: number; seconds: number }>;
    length: {
        total_seconds: number;
        total_hours: number;
        median_seconds: number;
        mean_seconds: number;
        p90_seconds: number;
        shortest: { video_id: string; seconds: number } | null;
        longest: { video_id: string; seconds: number } | null;
    };
    length_by_kind: Partial<
        Record<MediaKind, { total_seconds: number; median_seconds: number }>
    >;
    top_by_views: Array<{
        video_id: string;
        external_id: string;
        title: string;
        view_count: number;
    }>;
    engagement: { total_views: number; total_likes: number; median_views: number };
    caption_coverage: {
        with_captions: number;
        without_captions: number;
        unknown: number;
        coverage_percent: number;
    };
    transcripts: Record<"ready" | "queued" | "running" | "failed" | "none", number>;
    stale: boolean;
}

/** §3.1 — the Library row. The frontend can render entirely from this. */
export interface LibraryRow {
    id: string;
    organization_id: string;
    adapter: MediaAdapter;
    kind: LibraryKind;
    external_id: string;
    uploads_playlist_id: string | null;
    name: string;
    description: string | null;
    handle: string | null;
    canonical_url: string;
    thumbnail_url: string | null;
    visibility: LibraryVisibility;
    item_count: number | null;
    sync_status: LibrarySyncStatus;
    /** A sentence when sync_status === "failed", else null. Never a code. */
    sync_error: string | null;
    last_synced_at: string | null;
    last_sync_duration_ms: number | null;
    settings: Record<string, unknown>;
    metrics: LibraryMetrics | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}

export interface LibraryListResponse {
    libraries: LibraryRow[];
    total: number;
    limit: number;
    offset: number;
    lane_counts?: { mine: number; org: number; community: number; world: number };
}

/** §4.2 — the Source row (one catalogued video today). */
export interface VideoRow {
    id: string;
    external_id: string;
    url: string;
    title: string;
    description: string | null;
    channel_id: string | null;
    channel_title: string | null;
    published_at: string | null;
    duration_iso: string | null;
    duration_seconds: number | null;
    thumbnail_url: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
    media_kind: MediaKind;
    media_kind_signal: MediaKindSignal;
    live_broadcast_content: string | null;
    has_captions: boolean | null;
    /** [] until a free-lane probe ran — never null. */
    caption_languages: string[];
    transcript_status: TranscriptStatus;
    transcript_id: string | null;
    transcript_lane: TranscriptLane | null;
    processing_status: string | null;
    position: number | null;
    first_discovered_at: string | null;
    last_seen_at: string | null;
}

/** §4.2 query — also the selection descriptor of §7. */
export interface VideoQuery {
    media_kind?: MediaKind[];
    has_captions?: boolean;
    transcript_status?: TranscriptStatus[];
    published_after?: string;
    published_before?: string;
    min_duration_seconds?: number;
    max_duration_seconds?: number;
    q?: string;
    order?: "published_at" | "view_count" | "duration_seconds" | "title";
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
}

export interface VideoListResponse {
    videos: VideoRow[];
    total: number;
    limit: number;
    offset: number;
    filtered_total: number;
}

/** §4.1 — sync stream events. Discriminated on `type`. */
interface SyncEventBase {
    operation_id: string;
    library_id: string;
    seq: number;
    at: string;
}

export type SyncEvent =
    | (SyncEventBase & {
          type: "library.sync.started";
          expected_total: number | null;
          mode: "full" | "incremental";
          quota_units_reserved: number;
      })
    | (SyncEventBase & {
          type: "library.sync.page";
          page_index: number;
          page_size: number;
          videos: VideoRow[];
          cumulative: number;
          next_page_token_present: boolean;
      })
    | (SyncEventBase & {
          type: "library.sync.classified";
          video_ids: string[];
          classifications: Array<{
              video_id: string;
              media_kind: MediaKind;
              media_kind_signal: MediaKindSignal;
          }>;
      })
    | (SyncEventBase & {
          type: "library.sync.progress";
          listed: number;
          expected_total: number | null;
          elapsed_ms: number;
      })
    | (SyncEventBase & { type: "library.sync.metrics"; metrics: LibraryMetrics })
    | (SyncEventBase & {
          type: "library.sync.completed";
          total_listed: number;
          new_count: number;
          updated_count: number;
          removed_count: number;
          elapsed_ms: number;
          quota_units_spent: number;
          metrics: LibraryMetrics;
      })
    | (SyncEventBase & {
          type: "library.sync.unavailable";
          code: string;
          message: string;
          remedy: string | null;
          partial_total: number;
      })
    | (SyncEventBase & {
          type: "library.sync.failed";
          code: string;
          message: string;
          partial_total: number;
          retryable: boolean;
      })
    | (SyncEventBase & {
          type: "classify.completed";
          classified: number;
          by_signal: Record<string, number>;
          changed: number;
      });

export const SYNC_TERMINAL_TYPES = [
    "library.sync.completed",
    "library.sync.unavailable",
    "library.sync.failed",
] as const;

/** §7.2 — the estimate. Nothing paid runs without this having been shown and confirmed. */
export interface SelectionDescriptor {
    video_ids?: string[] | null;
    filter?: VideoQuery | null;
}

export interface EstimateRequest {
    action: string;
    selection: SelectionDescriptor;
    allow_paid?: boolean;
    prefer_lane?: TranscriptLane;
    params?: Record<string, unknown>;
}

export interface EstimateResult {
    estimate_token: string;
    expires_at: string;
    action: string;
    selected_count: number;
    already_done: number;
    free_count: number;
    paid_count: number;
    skipped_count: number;
    paid_video_ids: string[];
    cost: {
        currency: string;
        free_cost: number;
        paid_cost_estimate: number;
        paid_cost_low: number;
        paid_cost_high: number;
        basis: string;
    };
    time: {
        free_seconds_estimate: number;
        paid_seconds_estimate: number;
        wall_seconds_estimate: number;
        parallelism: number;
    };
    quota: { units_required: number; units_remaining: number };
    warnings: string[];
    requires_confirmation: boolean;
}

/** §7.4 — the Job row. */
export interface JobTotals {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    skipped: number;
}

export interface JobRow {
    id: string;
    library_id: string;
    organization_id: string;
    action: string;
    name: string | null;
    status: JobStatus;
    parallelism: number;
    allow_paid: boolean;
    totals: JobTotals;
    lane_totals: Partial<Record<TranscriptLane, number>>;
    estimate: EstimateResult | null;
    estimate_confirmed_at: string | null;
    progress_percent: number;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    operation_id: string | null;
}

/** §7.5 — the Job item row. `error` is always a sentence. */
export interface JobItemRow {
    id: string;
    job_id: string;
    video_id: string;
    external_id: string | null;
    title: string | null;
    lane: TranscriptLane | null;
    status: JobItemStatus;
    attempt: number;
    error: string | null;
    retryable: boolean;
    result: Record<string, unknown> | null;
    started_at: string | null;
    completed_at: string | null;
}

export interface JobDetailResponse {
    job: JobRow;
    items: JobItemRow[];
    items_total: number;
}

export type JobEvent =
    | { type: "job.started"; job: JobRow }
    | { type: "job.item.started"; item: JobItemRow }
    | { type: "job.item.finished"; item: JobItemRow; totals: JobTotals }
    | {
          type: "job.progress";
          totals: JobTotals;
          progress_percent: number;
          elapsed_ms: number;
          eta_seconds: number | null;
      }
    | { type: "job.completed"; job: JobRow; totals: JobTotals; elapsed_ms: number }
    | { type: "job.failed"; job: JobRow; code: string; message: string };

/** §8 — the Action registry. The client renders this menu, never a hardcoded one. */
export interface ActionDeclaration {
    key: string;
    label: string;
    description: string;
    scope: "per_item" | "whole_selection";
    cost_class: "free" | "cheap" | "mixed" | "paid";
    requires_estimate: boolean;
    requires_transcripts: boolean;
    params_schema: Record<string, unknown> | null;
    produces: string[];
}

export interface CreateJobRequest {
    action: string;
    selection: SelectionDescriptor;
    estimate_token?: string | null;
    parallelism?: number;
    allow_paid?: boolean;
    prefer_lane?: TranscriptLane;
    params?: Record<string, unknown>;
    name?: string;
}

/** §9 — settings knobs, each carrying where its value came from. */
export interface MediaSettingKnob {
    value: unknown;
    default: unknown;
    source: "default" | "org" | "library";
    type: "integer" | "boolean" | "enum" | "string_array" | "string";
    label?: string;
    min?: number;
    max?: number;
    options?: string[];
}

export interface MediaSettingsResponse {
    settings: Record<string, MediaSettingKnob>;
    reclassification_needed?: number;
}

export const MEDIA_SETTING_KEYS = [
    "shorts_threshold_seconds",
    "job_parallelism",
    "classifier_concurrency",
    "caption_language_preference",
    "allow_auto_generated_captions",
    "prefer_lane",
    "default_selection",
    "sync_mode_default",
    "allow_paid_by_default",
] as const;

export type MediaSettingKey = (typeof MEDIA_SETTING_KEYS)[number];
