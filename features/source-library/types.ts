/**
 * Wire types for the Media Source Catalog.
 *
 * SoR: ../../../common-docs/projects/media-source-catalog/API-CONTRACT.md (contract 0.1.0).
 * The server lane owns that file; these types are its TypeScript face. When the contract
 * version moves, this file moves with it in the same session — never a local divergence.
 *
 * Canonical nouns only: Library, Source, Action. Nothing here coins a noun.
 */

/**
 * Every adapter the running server declares (aidream `media_catalog/models.py`,
 * `AdapterKey`). This list was two behind on 2026-09-18 — `blog_feed` and
 * `slide_deck` had shipped and the paste box was already advertising them —
 * which is how a blog Library ended up rendering under YouTube's vocabulary.
 */
export type MediaAdapter =
    | "youtube"
    | "podcast_rss"
    | "blog_feed"
    | "slide_deck"
    | "drive_folder"
    | "onedrive_drive"
    | "outlook_mail"
    | "outlook_calendar"
    | "teams_chat"
    | "google_picked_files";
export type LibraryKind = "channel" | "playlist";
/**
 * THE PLATFORM'S OWN ENUM SPELLING, and it is not the one that reads naturally.
 * API-CONTRACT §3 (corrected in 0.2.0): `personal` (mine) · `internal` (my org)
 * · `link` (anyone with the link) · `public` (world). This file said
 * `private`/`shared` until 2026-09-17, so every create sent
 * `visibility: "private"` and the server refused the whole request —
 * "Input should be 'personal', 'internal', 'link' or 'public'" — which nobody
 * saw because an organization error fired one call earlier.
 */
export type LibraryVisibility = "personal" | "internal" | "link" | "public";
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
    /**
     * §4.3 — the header's per-Action counts, computed server-side over the SAME
     * filter the list uses, never tallied from the 25 rows a page happens to hold.
     *
     * An Action nobody has ever run is ABSENT from this map, not present as four
     * zeros: a Library that has never been sent to a Rulebook has no Rulebook
     * count to show, and rendering "0 ready, 0 failed" would be a tile about
     * something that never happened. `{}` from an older server means exactly the
     * same thing and renders exactly the same way — nothing.
     */
    action_outcomes: Record<string, Record<ActionOutcomeStatus, number>>;
    /**
     * Each Source counted ONCE, by whatever ran on it most recently. This and
     * `action_outcomes` never sum to the same number and answer different
     * questions — "how did the Rulebook send go" versus "how many Sources are in
     * a failed state right now".
     */
    last_action: Record<ActionOutcomeStatus, number>;
    /** Sources no Action has ever touched. */
    untouched: number;
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
    /**
     * One sentence per Library row that could not be read, in the same order
     * it was dropped — that row is simply absent from `libraries` above,
     * never guessed at, never taking any other Library in this page with it.
     */
    row_problems: string[];
    total: number;
    limit: number;
    offset: number;
    lane_counts?: { mine: number; org: number; community: number; world: number };
}

/**
 * §4.3 — what ONE Action did to ONE Source.
 *
 * 🚨 THE WORDS ARE `transcript_status`'S OWN, and not one of them is new. An
 * Action either did the thing (`ready`), knowingly did not (`skipped`), broke
 * (`failed`), or is doing it right now (`running`). `none` and `queued` are
 * deliberately absent from this type: an Action that never touched a Source has
 * NO entry in `action_outcomes` — absent, which is a different and honester fact
 * than a word meaning "nothing".
 */
export type ActionOutcomeStatus = "ready" | "running" | "skipped" | "failed";

/**
 * One outcome, as the Library screen shows it.
 *
 * `sentence` is ALWAYS present and is always a sentence — the server sends the
 * runner's own words for a skip or a failure, and a stated result for a success.
 * A row that rendered a status badge with no sentence would be the silent
 * failure this whole projection exists to remove, so the narrowing below REFUSES
 * an outcome without one rather than rendering an empty line.
 *
 * `job_id` is what the "Open the job" link needs. It is nullable because the
 * contract says an Action need not run through the job queue; nothing sends null
 * today, and a row that does simply shows the line without the link.
 */
export interface ActionOutcome {
    action_key: string;
    job_id: string | null;
    status: ActionOutcomeStatus;
    sentence: string;
    at: string;
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
    /**
     * TWO DIFFERENT FACTS, AND THE SERVER MEANS BOTH (contract §4.2,
     * `SourceRow.caption_languages`): `[]` is "we probed and there are no
     * tracks"; `null` is "nobody has ever probed". The free-captions lane that
     * would populate it is not built yet, so EVERY row on a live channel comes
     * back `null` today — a client that types this as `string[]` and reads
     * `.length` takes the whole page down, which is exactly what happened on
     * the one catalogued Library on 2026-09-17. Never widen this to `string[]`.
     */
    caption_languages: string[] | null;
    /**
     * §4.3 — DERIVED SERVER-SIDE from `action_outcomes.transcribe`, and still its
     * own field. Every filter, column and metric that reads it keeps working; what
     * changed is that its value now comes from the same projection every other
     * Action writes, instead of from the one column only `transcribe` ever wrote.
     */
    transcript_status: TranscriptStatus;
    transcript_id: string | null;
    transcript_lane: TranscriptLane | null;
    /**
     * §4.3 — every Action that has ever finished on this Source, keyed by Action
     * key. `{}` means nothing has ever run on it, which is why the column shows a
     * dash rather than a word: absent is not a status.
     *
     * NULLABLE ON THE WIRE. A server that predates the projection sends neither
     * this nor `last_action`, and a client and a server deploy minutes apart —
     * so the narrowing coalesces a missing field to `{}` / `null` and NEVER drops
     * the Source for it. Contract §0.5's envelope tolerance, applied to a field.
     */
    action_outcomes: Record<string, ActionOutcome>;
    /** The most recent of `action_outcomes` by `at` — the ONE line the row shows. */
    last_action: ActionOutcome | null;
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
    /**
     * §4.3. Together these read "which of these went to the Rulebook" and "which
     * ones failed". `action_status` ALONE narrows on the most recent Action, which
     * is what "show me the failures" means on a list of Sources; with an
     * `action_key` it narrows on THAT Action's outcome, which is a different and
     * more specific question.
     */
    action_key?: string;
    action_status?: ActionOutcomeStatus[];
    order?: "published_at" | "view_count" | "duration_seconds" | "title";
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
}

export interface VideoListResponse {
    videos: VideoRow[];
    /** Same rule as `LibraryListResponse.row_problems` — dropped, never hidden. */
    row_problems: string[];
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
          /**
           * What the catalogue LEFT OUT, and why. A blog crawl reaches taxonomy
           * pages, pagination, nav widgets and assets; waitbutwhy.com reported 346
           * "Posts" against its own sitemap's 202 and nothing on screen could have
           * said so. Absent or empty means nothing was discarded — never "we did
           * not look", which is why the server sends `{}` rather than omitting it.
           */
          skipped_by_reason: Record<string, number>;
          skipped_total: number;
          /**
           * True when a full sync would have retired half or more of the
           * Sources it just persisted — a shape that looks like a
           * reconciliation bug rather than a real provider change — and the
           * server refused the retirement rather than deleting the
           * catalogue out from under a person. `removed_count` stays 0 in
           * that case; this is the only field that says "0 removed" means
           * "refused" rather than "nothing was gone".
           */
          retire_refused: boolean;
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
    /**
     * `media.selection_item.source_row_id` and the transcript association both
     * use the catalogued Source id. `video_ids` is a different, legacy-shaped
     * name used only by the classifier endpoint; sending it here makes
     * Pydantic fall back to an empty Selection, which means the whole Library.
     */
    source_ids?: string[] | null;
    filter?: VideoQuery | null;
}

export interface EstimateRequest {
    action: string;
    selection: SelectionDescriptor;
    allow_paid?: boolean;
    prefer_lane?: TranscriptLane;
    params?: Record<string, unknown>;
}

/**
 * WHO DECIDED ABOUT MONEY, AND WHAT THAT MEANS FOR THIS RUN (server-owned).
 *
 * 🚨 THE 2026-09-20 DEFECT this closes: `allow_paid` defaulted to TRUE on the
 * wire, so a caller that never mentioned money got paid work — five blocked
 * videos were escalated to the paid lane on a live Library and real money was
 * spent with nobody shown a bill. The server now resolves an omitted
 * `allow_paid` against the organisation's `allow_paid_by_default` knob and
 * SAYS SO, in this object, in its own words.
 *
 * Every sentence here is written by the server and rendered verbatim. This
 * client never authors the money words and never infers the outcome from the
 * counts beside them.
 */
export interface PaidPolicy {
    /** Whether paid work was permitted for this run. */
    allowed: boolean;
    /**
     * Where that answer came from, as a PERSON-FACING PHRASE — the server sends
     * exactly one of "this run" (the caller stated `allow_paid` explicitly) or
     * "your organization's settings" (it was omitted and resolved from the
     * `allow_paid_by_default` knob). These are words, not enum tokens: never
     * switch on them, never print them beside a label that assumes a token.
     */
    decided_by: string;
    /** How many items would have gone to the paid lane. */
    would_be_paid_count: number;
    /** Always present, always names money in plain English. */
    sentence: string;
    /** When paid work was NOT allowed: how to allow it. Null when it was. */
    how_to_allow: string | null;
}

export interface EstimateResult {
    /**
     * §7.3 (contract v0.5.5): NULLABLE. Whether a token is required is the
     * Action's own `requires_estimate` declaration, never this field's
     * presence — an Action that declares no estimate (`send_to_rulebook`,
     * `build_knowledge_base`, `export`, …) mints and confirms its estimate in
     * one breath server-side, and the frozen `Job.estimate` that comes back
     * can carry every other number here with no token at all. A client must
     * never refuse the whole estimate, or the whole Job it is frozen into,
     * over this one field being absent.
     */
    estimate_token: string | null;
    /** Paired with `estimate_token`: no token minted, no expiry to report. */
    expires_at: string | null;
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
    /**
     * Estimates do not call the YouTube Data API, so a server may omit this
     * unrelated ledger snapshot. When it does provide one, both values are
     * still narrowed by the wire parser rather than guessed.
     */
    quota: { units_required: number; units_remaining: number } | null;
    warnings: string[];
    /**
     * Null on a server that predates the paid-policy contract, and on any row
     * frozen before it. The same sentence is also appended to `warnings`, which
     * is why a client that only renders warnings is still honest.
     */
    paid_policy: PaidPolicy | null;
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
    /**
     * Frozen from the estimate at pricing time: how a FINISHED job still says
     * whether money was spent and, when it was not, how to allow it next time.
     * Null on jobs created before this contract.
     */
    paid_policy: PaidPolicy | null;
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
    /** One honest sentence per item this build could not read — dropped, never
     *  guessed. See `mapListRows` in `lib/contract/narrow.ts`. */
    row_problems: string[];
    items_total: number;
}

/** `GET /media/libraries/{id}/jobs` — the job-discovery door (contract §7). */
export interface JobListResponse {
    jobs: JobRow[];
    /**
     * One sentence per Job row that could not be read. That Job is simply
     * absent from `jobs` above — this is the field that closes the
     * 2026-09-18 defect where one bad Job's `estimate.estimate_token` blanked
     * the whole running-jobs panel; every OTHER Job still comes through, and
     * a caller can show this list beside them ("N job(s) could not be read").
     */
    row_problems: string[];
    total: number;
    limit: number;
    offset: number;
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
    /**
     * 🚨 THE HONESTY RULE, and the client half of it. The server declares an
     * Action whose runner is not wired with `available: false` and a SENTENCE —
     * it is never hidden, because a person planning work should see what the
     * platform intends to do, and it is never offered as though it worked.
     *
     * This interface omitted all three fields, so every declaration became a
     * live button: `summarize` and `organize` were offered on the bar, opened
     * the confirm, and answered 501 on Start. That is law 4 breaking — a
     * control that is neither absent nor honest.
     *
     * Optional because a client and a server deploy minutes apart and the shape
     * that arrives during that window is whichever build answered; an absent
     * `available` is read as available, which is what every Action was before
     * the field existed.
     */
    available?: boolean;
    /** A sentence when `available` is false. Never a code, never blank. */
    unavailable_reason?: string | null;
    /** Set when the Action is NOT run through POST …/jobs (today: `export`). */
    endpoint?: string | null;
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
