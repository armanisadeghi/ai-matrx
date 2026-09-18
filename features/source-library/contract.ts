/**
 * THE BOUNDARY for the Media Source Catalog. Every byte the `/media` catalog
 * endpoints and their streams send is narrowed here before any component may
 * render it.
 *
 * 🚨 WHY THIS FILE EXISTS — the defect it closes, so nobody deletes it.
 * On 2026-09-17 `/exports` crashed on every load with React's "Objects are not
 * valid as a React child (found: object with keys {label, block})": the live
 * server had turned a COUNT into a LIST of objects, the hand-written interface
 * still said `number`, and nothing between the socket and the JSX ever looked.
 * `features/exports/contract.ts` closed it there. The census that followed
 * found the SAME hole open in this feature: `api.ts`'s `unwrap<T>()` was
 * `return result.data as T`, a cast with no check, and it was the return path
 * of nearly every function in the file — while `JobPanel` renders
 * `item.title`, `item.external_id` and `item.attempt`, and
 * `SourceDetailPanel`, `LibraryMetricsHeader` and the list columns render
 * Library, Source and metrics fields straight into JSX. One server-side rename
 * of any of them was one blank `/libraries` route away.
 *
 * 🚨 WHY A TYPE ALONE CANNOT FIX IT. `types.ts` is the TypeScript face of a
 * hand-written contract document (API-CONTRACT.md 0.1.0), not a generated
 * schema — `pnpm sync-types` does not yet supply these routes, which is why
 * `contract-paths.ts` exists. A type parameter is erased at run time: it says
 * what we HOPE arrived. Only a runtime check makes a shape true, and the
 * readers doing it here are the platform's, from `lib/contract/narrow.ts`.
 *
 * HOW STRICT, AND WHY THAT STRICT. Two rules, applied field by field:
 *   • A field the screen NEEDS and cannot read refuses with the readable
 *     sentence. Every screen in this feature already prints a `MediaApiError`
 *     message, and `MediaContractError` IS one — so an unreadable shape lands
 *     in the same banner, beside the same working retry, with no new branch in
 *     any component.
 *   • A field that is ABSENT is not the same as a field that is WRONG. The
 *     running server answers `GET /media/libraries/{id}` with fewer keys than
 *     the contract publishes, so a parser that demanded every key would blank
 *     screens the old cast rendered fine. Absent → the empty/derived value.
 *     Present but a shape a person cannot read → refused, loudly.
 *   • Enum-ish strings (`sync_status`, `status`, `media_kind`, …) are read as
 *     TEXT and passed through, never checked against a list. A member this
 *     build has not heard of must not take a screen down — the components look
 *     these up in records and fall back. A value that is not text at all is
 *     refused, because that is the shape that reaches JSX.
 */

import {
    ContractError,
    createReaders,
    mapListRows,
    recovered,
    type Parsed,
} from "@/lib/contract/narrow";
import type {
    ActionDeclaration,
    EstimateResult,
    JobDetailResponse,
    JobListResponse,
    JobEvent,
    JobItemRow,
    JobRow,
    JobTotals,
    LibraryListResponse,
    LibraryMetrics,
    LibraryRow,
    MediaErrorDetail,
    MediaSettingKnob,
    MediaSettingsResponse,
    ResolveResult,
    SyncEvent,
    VideoListResponse,
    VideoRow,
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
 *
 * It lives here rather than in `api.ts` so the shape parsers below can throw a
 * subclass of it without a circular import; `api.ts` re-exports it, so every
 * existing `import { MediaApiError } from "../api"` still reads the same.
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

/**
 * The server answered, and this screen cannot read what it said.
 *
 * 🚨 IT IS A `MediaApiError` ON PURPOSE. Every failure surface in this feature
 * — the Library page, the job panel, the paste box, the list shell, the
 * settings tab — already prints `error.message` for a `MediaApiError` and
 * offers its retry. Making the shape refusal one of those means an unreadable
 * payload arrives on screen as a sentence a person can read, through code that
 * already exists, instead of as a blank route or a React crash.
 *
 * `retryable` is true because a shape is usually a deploy skew: the same call
 * against the next server build normally works, and a retry control that does
 * nothing is worse than none.
 */
export class MediaContractError extends MediaApiError {
    readonly field: string;
    readonly expected: string;
    readonly got: string;

    constructor(field: string, expected: string, got: string) {
        super(
            {
                message: new ContractError(field, expected, got).message,
                code: "unreadable_shape",
                remedy:
                    "Nothing was guessed. Try again — and if it keeps happening, tell an operator, because the server and this screen disagree about what this field is.",
                retryable: true,
            },
            undefined,
            true,
        );
        this.name = "MediaContractError";
        this.field = field;
        this.expected = expected;
        this.got = got;
    }
}

const { obj, arr, str, optStr, num, optNum, bool, optBool, strList } = createReaders(
    (field, expected, got) => new MediaContractError(field, expected, got),
);

/** Text this screen can live without: absent → the fallback, wrong → refused. */
function text(value: unknown, field: string, fallback = ""): string {
    return optStr(value, field) ?? fallback;
}

/** A number this screen can live without: absent → the fallback, wrong → refused. */
function number(value: unknown, field: string, fallback = 0): number {
    return optNum(value, field) ?? fallback;
}

/**
 * An enum-ish string. Read as text and passed through — see the header: a
 * member this build has not heard of must cost a label, never a screen.
 */
function member<T extends string>(value: unknown, field: string, fallback: T): T {
    const read = optStr(value, field);
    return (read ?? fallback) as T;
}

/**
 * A `{reason: count}` breakdown. Every value must be a number — a reason whose
 * count is not a number is a shape this screen cannot add up, and printing "202
 * posts, [object Object] skipped" is worse than printing nothing.
 */
function countsByReason(value: unknown, field: string): Record<string, number> {
    if (value === undefined || value === null) return {};
    const row = obj(value, field);
    const out: Record<string, number> = {};
    for (const [reason, count] of Object.entries(row)) {
        out[reason] = num(count, `${field}.${reason}`);
    }
    return out;
}

/** A free-form JSON object (`settings`, `result`, `params_schema`). */
function optObj(value: unknown, field: string): Record<string, unknown> | null {
    if (value === undefined || value === null) return null;
    return obj(value, field);
}

/* ───────────────────────────────────────────────── §2 resolve ─────────── */

/** `POST /media/resolve` — what the paste box shows before anything is created. */
export function parseResolveResult(payload: unknown, field = "the resolved input"): ResolveResult {
    const row = obj(payload, field);
    return {
        adapter: member(row.adapter, `${field}.adapter`, "youtube"),
        kind: member(row.kind, `${field}.kind`, "channel"),
        external_id: text(row.external_id, `${field}.external_id`),
        uploads_playlist_id: optStr(row.uploads_playlist_id, `${field}.uploads_playlist_id`),
        title: text(row.title, `${field}.title`),
        handle: optStr(row.handle, `${field}.handle`),
        description: optStr(row.description, `${field}.description`),
        thumbnail_url: optStr(row.thumbnail_url, `${field}.thumbnail_url`),
        published_at: optStr(row.published_at, `${field}.published_at`),
        item_count: optNum(row.item_count, `${field}.item_count`),
        subscriber_count: optNum(row.subscriber_count, `${field}.subscriber_count`),
        view_count: optNum(row.view_count, `${field}.view_count`),
        resolved_from: member(row.resolved_from, `${field}.resolved_from`, "channel_id"),
        canonical_url: text(row.canonical_url, `${field}.canonical_url`),
        existing_library_id: optStr(row.existing_library_id, `${field}.existing_library_id`),
    };
}

/* ───────────────────────────────────────────────── §3 libraries ───────── */

/**
 * One Library row.
 *
 * `id` is the only field that refuses when absent: without it the paste box
 * navigates to `/libraries/undefined` and the header waits forever on a row
 * that can never arrive — the exact silent failure of 2026-09-17.
 *
 * `metrics` is read SHALLOWLY on purpose. It is the `media.source_library`
 * JSONB column — whatever the last sync happened to write, possibly from an
 * older build — and `redux/sourceLibrarySlice.ts` already refuses to adopt a
 * blob that does not carry the sections the header reads. Narrowing it field by
 * field here would refuse a Library row over a stale cache that nothing
 * renders.
 */
export function parseLibraryRow(payload: unknown, field = "this Library"): LibraryRow {
    const row = obj(payload, field);
    return {
        id: str(row.id, `${field}.id`),
        organization_id: text(row.organization_id, `${field}.organization_id`),
        adapter: member(row.adapter, `${field}.adapter`, "youtube"),
        kind: member(row.kind, `${field}.kind`, "channel"),
        external_id: text(row.external_id, `${field}.external_id`),
        uploads_playlist_id: optStr(row.uploads_playlist_id, `${field}.uploads_playlist_id`),
        name: text(row.name, `${field}.name`),
        description: optStr(row.description, `${field}.description`),
        handle: optStr(row.handle, `${field}.handle`),
        canonical_url: text(row.canonical_url, `${field}.canonical_url`),
        thumbnail_url: optStr(row.thumbnail_url, `${field}.thumbnail_url`),
        visibility: member(row.visibility, `${field}.visibility`, "personal"),
        item_count: optNum(row.item_count, `${field}.item_count`),
        sync_status: member(row.sync_status, `${field}.sync_status`, "never_synced"),
        sync_error: optStr(row.sync_error, `${field}.sync_error`),
        last_synced_at: optStr(row.last_synced_at, `${field}.last_synced_at`),
        last_sync_duration_ms: optNum(
            row.last_sync_duration_ms,
            `${field}.last_sync_duration_ms`,
        ),
        settings: optObj(row.settings, `${field}.settings`) ?? {},
        metrics: (optObj(row.metrics, `${field}.metrics`) as LibraryMetrics | null) ?? null,
        created_at: text(row.created_at, `${field}.created_at`),
        updated_at: text(row.updated_at, `${field}.updated_at`),
        created_by: optStr(row.created_by, `${field}.created_by`),
    };
}

/**
 * `GET /media/libraries` — the list behind every lane tab.
 *
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING. One Library whose shape this build cannot
 * read must not blank the lane for every OTHER Library that reads fine — see
 * `mapListRows` in `lib/contract/narrow.ts`. The bad row is dropped and its
 * sentence collected in `row_problems` for the shell to show; the Libraries
 * that parsed are the ones a person needs to keep working.
 */
export function parseLibraryListResponse(payload: unknown): LibraryListResponse {
    const root = obj(payload, "the list of Libraries");
    const { rows: libraries, problems: row_problems } = mapListRows(
        arr(root.libraries ?? [], "libraries"),
        (entry, index) => parseLibraryRow(entry, `libraries[${index}]`),
    );
    const lanes = optObj(root.lane_counts, "lane_counts");
    return {
        libraries,
        row_problems,
        total: number(root.total, "total", libraries.length),
        limit: number(root.limit, "limit", libraries.length),
        offset: number(root.offset, "offset"),
        // Absent is a real answer here and the list shell prints it: "this
        // server did not report a per-lane count". Never invented as zeroes.
        ...(lanes
            ? {
                  lane_counts: {
                      mine: number(lanes.mine, "lane_counts.mine"),
                      org: number(lanes.org, "lane_counts.org"),
                      community: number(lanes.community, "lane_counts.community"),
                      world: number(lanes.world, "lane_counts.world"),
                  },
              }
            : {}),
    };
}

/* ───────────────────────────────────────────────── §5 metrics ─────────── */

function parsePeriods(
    value: unknown,
    field: string,
): LibraryMetrics["cadence_per_month"] {
    return arr(value ?? [], field).map((entry, index) => {
        const row = obj(entry, `${field}[${index}]`);
        return {
            period: text(row.period, `${field}[${index}].period`),
            count: number(row.count, `${field}[${index}].count`),
            seconds: number(row.seconds, `${field}[${index}].seconds`),
        };
    });
}

function parseVideoRef(
    value: unknown,
    field: string,
): { video_id: string; seconds: number } | null {
    if (value === undefined || value === null) return null;
    const row = obj(value, field);
    return {
        video_id: text(row.video_id, `${field}.video_id`),
        seconds: number(row.seconds, `${field}.seconds`),
    };
}

/**
 * `GET /media/libraries/{id}/metrics` — every number in the header.
 *
 * `problems` is the announce channel for the stand-ins below. Two numbers here
 * are REDUNDANT — the caption coverage percentage and the total hours are both
 * computable from figures printed beside them — so a server that mislabels one
 * must not cost a person the whole header. They are recovered, and the sentence
 * saying so goes on the screen (`LibraryPage` prints it). Everything the header
 * cannot derive refuses instead.
 */
export function parseLibraryMetrics(
    payload: unknown,
    field: string,
    problems: string[],
): LibraryMetrics {
    const row = obj(payload, field);
    const length = obj(row.length ?? {}, `${field}.length`);
    const captions = obj(row.caption_coverage ?? {}, `${field}.caption_coverage`);

    const withCaptions = number(captions.with_captions, `${field}.caption_coverage.with_captions`);
    const withoutCaptions = number(
        captions.without_captions,
        `${field}.caption_coverage.without_captions`,
    );
    const unknownCaptions = number(captions.unknown, `${field}.caption_coverage.unknown`);
    const totalSeconds = number(length.total_seconds, `${field}.length.total_seconds`);

    const byKind = obj(row.counts_by_kind ?? {}, `${field}.counts_by_kind`);
    const countsByKind = {} as LibraryMetrics["counts_by_kind"];
    for (const [key, entry] of Object.entries(byKind)) {
        countsByKind[key as keyof LibraryMetrics["counts_by_kind"]] = number(
            entry,
            `${field}.counts_by_kind.${key}`,
        );
    }

    const lengthByKind: LibraryMetrics["length_by_kind"] = {};
    for (const [key, entry] of Object.entries(
        obj(row.length_by_kind ?? {}, `${field}.length_by_kind`),
    )) {
        const bucket = obj(entry, `${field}.length_by_kind.${key}`);
        lengthByKind[key as keyof LibraryMetrics["length_by_kind"]] = {
            total_seconds: number(bucket.total_seconds, `${field}.length_by_kind.${key}.total_seconds`),
            median_seconds: number(
                bucket.median_seconds,
                `${field}.length_by_kind.${key}.median_seconds`,
            ),
        };
    }

    const transcripts = {} as LibraryMetrics["transcripts"];
    for (const [key, entry] of Object.entries(
        obj(row.transcripts ?? {}, `${field}.transcripts`),
    )) {
        transcripts[key as keyof LibraryMetrics["transcripts"]] = number(
            entry,
            `${field}.transcripts.${key}`,
        );
    }

    const dateRange = obj(row.date_range ?? {}, `${field}.date_range`);
    const engagement = obj(row.engagement ?? {}, `${field}.engagement`);

    return {
        computed_at: text(row.computed_at, `${field}.computed_at`),
        library_id: text(row.library_id, `${field}.library_id`),
        total: number(row.total, `${field}.total`),
        counts_by_kind: countsByKind,
        date_range: {
            earliest: optStr(dateRange.earliest, `${field}.date_range.earliest`),
            latest: optStr(dateRange.latest, `${field}.date_range.latest`),
            span_days: optNum(dateRange.span_days, `${field}.date_range.span_days`),
        },
        cadence_per_month: parsePeriods(row.cadence_per_month, `${field}.cadence_per_month`),
        cadence_per_year: parsePeriods(row.cadence_per_year, `${field}.cadence_per_year`),
        length: {
            total_seconds: totalSeconds,
            total_hours: recovered(
                problems,
                `${field}.length.total_hours`,
                "a number",
                length.total_hours,
                () => number(length.total_hours, `${field}.length.total_hours`),
                () => totalSeconds / 3600,
            ),
            median_seconds: number(length.median_seconds, `${field}.length.median_seconds`),
            mean_seconds: number(length.mean_seconds, `${field}.length.mean_seconds`),
            p90_seconds: number(length.p90_seconds, `${field}.length.p90_seconds`),
            shortest: parseVideoRef(length.shortest, `${field}.length.shortest`),
            longest: parseVideoRef(length.longest, `${field}.length.longest`),
        },
        length_by_kind: lengthByKind,
        top_by_views: arr(row.top_by_views ?? [], `${field}.top_by_views`).map(
            (entry, index) => {
                const top = obj(entry, `${field}.top_by_views[${index}]`);
                return {
                    video_id: text(top.video_id, `${field}.top_by_views[${index}].video_id`),
                    external_id: text(
                        top.external_id,
                        `${field}.top_by_views[${index}].external_id`,
                    ),
                    title: text(top.title, `${field}.top_by_views[${index}].title`),
                    view_count: number(
                        top.view_count,
                        `${field}.top_by_views[${index}].view_count`,
                    ),
                };
            },
        ),
        engagement: {
            total_views: number(engagement.total_views, `${field}.engagement.total_views`),
            total_likes: number(engagement.total_likes, `${field}.engagement.total_likes`),
            median_views: number(engagement.median_views, `${field}.engagement.median_views`),
        },
        caption_coverage: {
            with_captions: withCaptions,
            without_captions: withoutCaptions,
            unknown: unknownCaptions,
            coverage_percent: recovered(
                problems,
                `${field}.caption_coverage.coverage_percent`,
                "a number",
                captions.coverage_percent,
                () =>
                    number(
                        captions.coverage_percent,
                        `${field}.caption_coverage.coverage_percent`,
                    ),
                () => {
                    const known = withCaptions + withoutCaptions;
                    return known === 0 ? 0 : (withCaptions / known) * 100;
                },
            ),
        },
        transcripts,
        stale: optBool(row.stale, `${field}.stale`, false),
    };
}

/** The metrics read, plus any stand-in it had to announce. */
export function parseMetricsResponse(payload: unknown): Parsed<LibraryMetrics> {
    const problems: string[] = [];
    return { value: parseLibraryMetrics(payload, "the numbers", problems), problems };
}

/* ───────────────────────────────────────────────── §4.2 sources ───────── */

/**
 * One catalogued Source.
 *
 * `caption_languages` keeps the THREE-STATE reading `types.ts` documents: a
 * list is "we probed and found these", `[]` is "we probed and found none",
 * `null` is "nobody has ever probed". Flattening `null` to `[]` here would
 * re-introduce the lie the columns were fixed for.
 */
export function parseVideoRow(payload: unknown, field: string): VideoRow {
    const row = obj(payload, field);
    return {
        id: str(row.id, `${field}.id`),
        external_id: text(row.external_id, `${field}.external_id`),
        url: text(row.url, `${field}.url`),
        title: text(row.title, `${field}.title`),
        description: optStr(row.description, `${field}.description`),
        channel_id: optStr(row.channel_id, `${field}.channel_id`),
        channel_title: optStr(row.channel_title, `${field}.channel_title`),
        published_at: optStr(row.published_at, `${field}.published_at`),
        duration_iso: optStr(row.duration_iso, `${field}.duration_iso`),
        duration_seconds: optNum(row.duration_seconds, `${field}.duration_seconds`),
        thumbnail_url: optStr(row.thumbnail_url, `${field}.thumbnail_url`),
        view_count: optNum(row.view_count, `${field}.view_count`),
        like_count: optNum(row.like_count, `${field}.like_count`),
        comment_count: optNum(row.comment_count, `${field}.comment_count`),
        media_kind: member(row.media_kind, `${field}.media_kind`, "unknown"),
        media_kind_signal: member(row.media_kind_signal, `${field}.media_kind_signal`, "unknown"),
        live_broadcast_content: optStr(
            row.live_broadcast_content,
            `${field}.live_broadcast_content`,
        ),
        has_captions:
            row.has_captions === undefined || row.has_captions === null
                ? null
                : bool(row.has_captions, `${field}.has_captions`),
        caption_languages:
            row.caption_languages === undefined || row.caption_languages === null
                ? null
                : strList(row.caption_languages, `${field}.caption_languages`),
        transcript_status: member(row.transcript_status, `${field}.transcript_status`, "none"),
        transcript_id: optStr(row.transcript_id, `${field}.transcript_id`),
        transcript_lane: optStr(
            row.transcript_lane,
            `${field}.transcript_lane`,
        ) as VideoRow["transcript_lane"],
        processing_status: optStr(row.processing_status, `${field}.processing_status`),
        position: optNum(row.position, `${field}.position`),
        first_discovered_at: optStr(row.first_discovered_at, `${field}.first_discovered_at`),
        last_seen_at: optStr(row.last_seen_at, `${field}.last_seen_at`),
    };
}

/**
 * `GET /media/libraries/{id}/videos` — the mount read behind the table.
 *
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING — same rule as `parseLibraryListResponse`
 * above: one unreadable Source is dropped and named in `row_problems`, never
 * allowed to take the whole page of Sources with it.
 */
export function parseVideoListResponse(payload: unknown): VideoListResponse {
    const root = obj(payload, "the Sources");
    const { rows: videos, problems: row_problems } = mapListRows(
        arr(root.videos ?? [], "videos"),
        (entry, index) => parseVideoRow(entry, `videos[${index}]`),
    );
    const total = number(root.total, "total", videos.length);
    return {
        videos,
        row_problems,
        total,
        limit: number(root.limit, "limit", videos.length),
        offset: number(root.offset, "offset"),
        // The list pages on `filtered_total`; falling back to `total` keeps
        // paging inside the set rather than walking off the end of it.
        filtered_total: number(root.filtered_total, "filtered_total", total),
    };
}

/* ───────────────────────────────────────────── §7 estimate & jobs ─────── */

/**
 * The estimate — the only thing standing between a person and a bill.
 *
 * 🚨 NOTHING HERE FALLS BACK TO ZERO. Every count and every cost is required:
 * a dialog that shows "$0.00" because a field was unreadable would collect a
 * confirmation for a spend nobody was shown. Unreadable → refused, and
 * `useActionRunner` leaves the start button disabled with the sentence on it.
 */
export function parseEstimateResult(payload: unknown, field = "the estimate"): EstimateResult {
    const row = obj(payload, field);
    const cost = obj(row.cost, `${field}.cost`);
    const time = obj(row.time, `${field}.time`);
    // An estimate prices existing Sources; it does not spend YouTube Data API
    // quota. Older contract drafts advertised a quota snapshot, but the live
    // server correctly omits it. Preserve strict validation when it is sent;
    // only its absence is compatible.
    const quota = row.quota === undefined ? null : obj(row.quota, `${field}.quota`);
    return {
        // 🚨 NULLABLE (contract v0.5.5, §7.3) — see `types.ts`'s
        // `EstimateResult.estimate_token` doc. A required `str()` here is what
        // shipped as MediaContractError on every free Action's Job on
        // 2026-09-18: the Job read back fine, its `estimate` object read back
        // fine, and only this one field, correctly absent, took the entire
        // Job down (and every sibling Job in the same list read — see
        // `mapListRows` in `lib/contract/narrow.ts`).
        estimate_token: optStr(row.estimate_token, `${field}.estimate_token`),
        expires_at: optStr(row.expires_at, `${field}.expires_at`),
        action: str(row.action, `${field}.action`),
        selected_count: num(row.selected_count, `${field}.selected_count`),
        already_done: num(row.already_done, `${field}.already_done`),
        free_count: num(row.free_count, `${field}.free_count`),
        paid_count: num(row.paid_count, `${field}.paid_count`),
        skipped_count: num(row.skipped_count, `${field}.skipped_count`),
        paid_video_ids: strList(row.paid_video_ids ?? [], `${field}.paid_video_ids`),
        cost: {
            currency: text(cost.currency, `${field}.cost.currency`, "USD"),
            free_cost: num(cost.free_cost, `${field}.cost.free_cost`),
            paid_cost_estimate: num(cost.paid_cost_estimate, `${field}.cost.paid_cost_estimate`),
            paid_cost_low: num(cost.paid_cost_low, `${field}.cost.paid_cost_low`),
            paid_cost_high: num(cost.paid_cost_high, `${field}.cost.paid_cost_high`),
            basis: text(cost.basis, `${field}.cost.basis`),
        },
        time: {
            free_seconds_estimate: num(
                time.free_seconds_estimate,
                `${field}.time.free_seconds_estimate`,
            ),
            paid_seconds_estimate: num(
                time.paid_seconds_estimate,
                `${field}.time.paid_seconds_estimate`,
            ),
            wall_seconds_estimate: num(
                time.wall_seconds_estimate,
                `${field}.time.wall_seconds_estimate`,
            ),
            parallelism: num(time.parallelism, `${field}.time.parallelism`),
        },
        quota: quota
            ? {
                  units_required: num(quota.units_required, `${field}.quota.units_required`),
                  units_remaining: num(quota.units_remaining, `${field}.quota.units_remaining`),
              }
            : null,
        warnings: strList(row.warnings ?? [], `${field}.warnings`),
        // Absent defaults to TRUE: confirming is the safe side of this knob.
        requires_confirmation: optBool(
            row.requires_confirmation,
            `${field}.requires_confirmation`,
            true,
        ),
    };
}

function parseTotals(value: unknown, field: string): JobTotals {
    const row = obj(value ?? {}, field);
    return {
        total: number(row.total, `${field}.total`),
        queued: number(row.queued, `${field}.queued`),
        running: number(row.running, `${field}.running`),
        succeeded: number(row.succeeded, `${field}.succeeded`),
        failed: number(row.failed, `${field}.failed`),
        skipped: number(row.skipped, `${field}.skipped`),
    };
}

/**
 * One Job row.
 *
 * `progress_percent` draws a bar and is read aloud by screen readers. A MISSING
 * one is computed from the totals printed beside it — the person sees the same
 * figures it came from, so nothing is hidden. A percent that arrives as a shape
 * this screen cannot read is refused, because a bar drawn from an object is the
 * 2026-09-17 crash with a progress element in front of it.
 */
export function parseJobRow(payload: unknown, field = "this job"): JobRow {
    const row = obj(payload, field);
    const totals = parseTotals(row.totals, `${field}.totals`);
    const lanes = optObj(row.lane_totals, `${field}.lane_totals`) ?? {};
    const laneTotals: JobRow["lane_totals"] = {};
    for (const [key, entry] of Object.entries(lanes)) {
        laneTotals[key as keyof JobRow["lane_totals"]] = number(
            entry,
            `${field}.lane_totals.${key}`,
        );
    }
    const done = totals.succeeded + totals.failed + totals.skipped;
    return {
        id: str(row.id, `${field}.id`),
        library_id: text(row.library_id, `${field}.library_id`),
        organization_id: text(row.organization_id, `${field}.organization_id`),
        action: text(row.action, `${field}.action`),
        name: optStr(row.name, `${field}.name`),
        status: member(row.status, `${field}.status`, "pending"),
        parallelism: number(row.parallelism, `${field}.parallelism`, 1),
        allow_paid: optBool(row.allow_paid, `${field}.allow_paid`, false),
        totals,
        lane_totals: laneTotals,
        estimate:
            row.estimate === undefined || row.estimate === null
                ? null
                : parseEstimateResult(row.estimate, `${field}.estimate`),
        estimate_confirmed_at: optStr(
            row.estimate_confirmed_at,
            `${field}.estimate_confirmed_at`,
        ),
        progress_percent: number(
            row.progress_percent,
            `${field}.progress_percent`,
            totals.total === 0 ? 0 : (done / totals.total) * 100,
        ),
        error: optStr(row.error, `${field}.error`),
        started_at: optStr(row.started_at, `${field}.started_at`),
        completed_at: optStr(row.completed_at, `${field}.completed_at`),
        created_at: text(row.created_at, `${field}.created_at`),
        operation_id: optStr(row.operation_id, `${field}.operation_id`),
    };
}

/** One Job item — the row `JobPanel` renders, field for field. */
export function parseJobItemRow(payload: unknown, field: string): JobItemRow {
    const row = obj(payload, field);
    return {
        id: str(row.id, `${field}.id`),
        job_id: text(row.job_id, `${field}.job_id`),
        video_id: text(row.video_id, `${field}.video_id`),
        external_id: optStr(row.external_id, `${field}.external_id`),
        title: optStr(row.title, `${field}.title`),
        lane: optStr(row.lane, `${field}.lane`) as JobItemRow["lane"],
        status: member(row.status, `${field}.status`, "queued"),
        attempt: number(row.attempt, `${field}.attempt`, 1),
        error: optStr(row.error, `${field}.error`),
        retryable: optBool(row.retryable, `${field}.retryable`, false),
        result: optObj(row.result, `${field}.result`),
        started_at: optStr(row.started_at, `${field}.started_at`),
        completed_at: optStr(row.completed_at, `${field}.completed_at`),
    };
}

/**
 * `GET /media/jobs/{id}` — the mount read the whole panel is built from.
 *
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING. One item this build cannot read must not
 * blank the whole queue for every OTHER item that reads fine — see
 * `mapListRows` in `lib/contract/narrow.ts`. The bad row is dropped and its
 * sentence collected in `row_problems`, which `JobPanel` shows as one honest
 * line per unreadable item, the same treatment the Jobs lane gets in
 * `parseJobListResponse` above.
 */
export function parseJobDetailResponse(payload: unknown): JobDetailResponse {
    const root = obj(payload, "this job");
    const { rows: items, problems: row_problems } = mapListRows(
        arr(root.items ?? [], "items"),
        (entry, index) => parseJobItemRow(entry, `items[${index}]`),
    );
    return {
        job: parseJobRow(root.job, "job"),
        items,
        row_problems,
        items_total: number(root.items_total, "items_total", items.length),
    };
}

/**
 * `GET /media/libraries/{id}/jobs` — THE JOB-DISCOVERY DOOR (contract §7).
 *
 * After a reload this page knows only the Library id, so without this read a durable
 * job cannot be found again and "survives a restart" is unprovable from the screen.
 * This endpoint existed on the server the whole time and nothing here ever called it;
 * the page kept job ids in `localStorage` instead, which meant a job whose id never
 * reached the browser — exactly what the `POST …/jobs` envelope defect caused — was
 * invisible forever even though its rows were sitting in the database.
 *
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING. Verified live 2026-09-18 (verify-4): a
 * single Job in this list whose `estimate.estimate_token` had gone missing
 * threw out of a plain `.map()`, and the exception took every OTHER Job on
 * the Library down with it — the entire running-jobs panel went dark, hiding
 * jobs that were reading correctly and making Cancel unreachable for all of
 * them, on a door whose whole purpose is "find a job you cannot afford to
 * lose". `mapListRows` (`lib/contract/narrow.ts`) keeps every Job that reads
 * and names the ones that do not in `row_problems`, so a caller can show
 * "N job(s) could not be read" beside the jobs it CAN show, instead of
 * showing nothing.
 */
export function parseJobListResponse(payload: unknown): JobListResponse {
    const root = obj(payload, "the jobs for this Library");
    const { rows: jobs, problems: row_problems } = mapListRows(
        arr(root.jobs ?? [], "jobs"),
        (entry, index) => parseJobRow(entry, `jobs[${index}]`),
    );
    return {
        jobs,
        row_problems,
        total: number(root.total, "total", jobs.length),
        limit: number(root.limit, "limit", jobs.length),
        offset: number(root.offset, "offset", 0),
    };
}

/** `POST …/resume` and `POST …/retry-failed` — a job row plus one count. */
export function parseJobAndCount<K extends string>(
    payload: unknown,
    countField: K,
): { job: JobRow } & Record<K, number> {
    const root = obj(payload, "the answer to that");
    return {
        job: parseJobRow(root.job, "job"),
        [countField]: number(root[countField], countField),
    } as { job: JobRow } & Record<K, number>;
}

/* ───────────────────────────────────────────────── §8 actions ─────────── */

/** One Action declaration — every button on the action bar comes from one. */
export function parseActionDeclaration(payload: unknown, field: string): ActionDeclaration {
    const row = obj(payload, field);
    return {
        key: str(row.key, `${field}.key`),
        label: str(row.label, `${field}.label`),
        description: text(row.description, `${field}.description`),
        scope: member(row.scope, `${field}.scope`, "per_item"),
        cost_class: member(row.cost_class, `${field}.cost_class`, "paid"),
        // Both default to the CAUTIOUS side: an action whose declaration does
        // not say it is free is estimated before it runs.
        requires_estimate: optBool(row.requires_estimate, `${field}.requires_estimate`, true),
        requires_transcripts: optBool(
            row.requires_transcripts,
            `${field}.requires_transcripts`,
            false,
        ),
        params_schema: optObj(row.params_schema, `${field}.params_schema`),
        produces: strList(row.produces ?? [], `${field}.produces`),
    };
}

/** `GET /media/actions`. */
/**
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING — same rule as the list parsers above. One
 * Action declaration this build cannot read must not take the whole action
 * bar down; it is dropped (that Action's button simply does not appear,
 * which is the safe side — a missing button, never a broken screen) while
 * every Action that DOES read renders normally. `listActions` keeps its
 * existing bare-array signature, so the dropped count is not surfaced yet;
 * see the call site (`api.ts#listActions`) before adding a caller that needs it.
 */
export function parseActionList(payload: unknown): ActionDeclaration[] {
    const root = obj(payload, "the list of Actions");
    const { rows } = mapListRows(
        arr(root.actions ?? [], "actions"),
        (entry, index) => parseActionDeclaration(entry, `actions[${index}]`),
    );
    return rows;
}

/* ───────────────────────────────────────────────── §9 settings ────────── */

function parseKnob(payload: unknown, field: string): MediaSettingKnob {
    const row = obj(payload, field);
    const options = row.options;
    return {
        // `value` and `default` are deliberately untyped on the wire — the knob
        // renderer switches on `type` and each branch reads its own shape.
        value: row.value,
        default: row.default,
        source: member(row.source, `${field}.source`, "default"),
        type: member(row.type, `${field}.type`, "string"),
        ...(row.label === undefined || row.label === null
            ? {}
            : { label: str(row.label, `${field}.label`) }),
        ...(row.min === undefined || row.min === null ? {} : { min: num(row.min, `${field}.min`) }),
        ...(row.max === undefined || row.max === null ? {} : { max: num(row.max, `${field}.max`) }),
        ...(options === undefined || options === null
            ? {}
            : { options: strList(options, `${field}.options`) }),
    };
}

/** `GET`/`PUT /media/settings`. */
export function parseMediaSettingsResponse(payload: unknown): MediaSettingsResponse {
    const root = obj(payload, "the settings");
    const source = obj(root.settings ?? {}, "settings");
    const settings: Record<string, MediaSettingKnob> = {};
    for (const [key, entry] of Object.entries(source)) {
        settings[key] = parseKnob(entry, `settings.${key}`);
    }
    return {
        settings,
        ...(root.reclassification_needed === undefined || root.reclassification_needed === null
            ? {}
            : {
                  reclassification_needed: num(
                      root.reclassification_needed,
                      "reclassification_needed",
                  ),
              }),
    };
}

/* ───────────────────────────────────────────── §4.1 stream events ─────── */

/**
 * What an event narrower can answer.
 *
 * 🚨 A MALFORMED EVENT MUST NEVER TAKE DOWN A RUNNING SYNC OR JOB. The work is
 * happening on the server and does not stop when this client trips; a thrown
 * parser here would abort the reader mid-run and leave a person watching a
 * frozen panel. So an event this build does not know is `null` (dropped in
 * silence, as the platform's own emitter traffic always was), and an event we
 * DO know but cannot read comes back as a `problem` sentence the caller shows
 * beside the progress — the same shape `features/exports`'s
 * `streamExportIndex` uses.
 */
export type EventRead<T> = { event: T } | { problem: string } | null;

function eventHead(row: Record<string, unknown>, type: string) {
    return {
        operation_id: text(row.operation_id, `${type}.operation_id`),
        library_id: text(row.library_id, `${type}.library_id`),
        seq: number(row.seq, `${type}.seq`),
        at: text(row.at, `${type}.at`),
    };
}

function problemOf(error: unknown): { problem: string } {
    return {
        problem:
            error instanceof MediaApiError
                ? error.message
                : `An update from the server could not be read: ${String(error)}`,
    };
}

/**
 * One sync-stream payload.
 *
 * `standIns` collects the announce sentences of any recovered field (the
 * metrics blob carried by `library.sync.metrics` and `library.sync.completed`
 * goes straight into the store, so it is narrowed here in full).
 */
export function parseSyncEvent(payload: unknown, standIns: string[]): EventRead<SyncEvent> {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
    const row = payload as Record<string, unknown>;
    const type = row.type;
    if (typeof type !== "string") return null;
    if (!type.startsWith("library.sync.") && type !== "classify.completed") return null;

    try {
        const head = eventHead(row, type);
        switch (type) {
            case "library.sync.started":
                return {
                    event: {
                        type,
                        ...head,
                        expected_total: optNum(row.expected_total, `${type}.expected_total`),
                        mode: member(row.mode, `${type}.mode`, "full"),
                        quota_units_reserved: number(
                            row.quota_units_reserved,
                            `${type}.quota_units_reserved`,
                        ),
                    },
                };
            case "library.sync.page": {
                // 🚨 ONE UNREADABLE VIDEO MUST NOT DROP THE WHOLE PAGE. This
                // page's videos are decoration only — the mount read owns the
                // real list — but before this fix a single bad row in a page of
                // (typically) 50 threw out of the `.map()` and the try/catch
                // above treated the WHOLE event as unreadable, losing every
                // sibling video's live-progress row along with it.
                // `mapListRows` (`lib/contract/narrow.ts`) drops only the bad
                // row; its sentence rides the same `standIns` channel every
                // other recovered field on this event already uses, so it
                // reaches the sync banner the normal way.
                const { rows: pageVideos, problems: pageVideoProblems } = mapListRows(
                    arr(row.videos ?? [], `${type}.videos`),
                    (entry, index) => parseVideoRow(entry, `${type}.videos[${index}]`),
                );
                standIns.push(...pageVideoProblems);
                return {
                    event: {
                        type,
                        ...head,
                        page_index: number(row.page_index, `${type}.page_index`),
                        page_size: number(row.page_size, `${type}.page_size`),
                        videos: pageVideos,
                        cumulative: number(row.cumulative, `${type}.cumulative`),
                        next_page_token_present: optBool(
                            row.next_page_token_present,
                            `${type}.next_page_token_present`,
                            false,
                        ),
                    },
                };
            }
            case "library.sync.classified":
                return {
                    event: {
                        type,
                        ...head,
                        video_ids: strList(row.video_ids ?? [], `${type}.video_ids`),
                        classifications: arr(
                            row.classifications ?? [],
                            `${type}.classifications`,
                        ).map((entry, index) => {
                            const one = obj(entry, `${type}.classifications[${index}]`);
                            return {
                                video_id: text(
                                    one.video_id,
                                    `${type}.classifications[${index}].video_id`,
                                ),
                                media_kind: member(
                                    one.media_kind,
                                    `${type}.classifications[${index}].media_kind`,
                                    "unknown",
                                ),
                                media_kind_signal: member(
                                    one.media_kind_signal,
                                    `${type}.classifications[${index}].media_kind_signal`,
                                    "unknown",
                                ),
                            };
                        }),
                    },
                };
            case "library.sync.progress":
                return {
                    event: {
                        type,
                        ...head,
                        listed: number(row.listed, `${type}.listed`),
                        expected_total: optNum(row.expected_total, `${type}.expected_total`),
                        elapsed_ms: number(row.elapsed_ms, `${type}.elapsed_ms`),
                    },
                };
            case "library.sync.metrics":
                return {
                    event: {
                        type,
                        ...head,
                        metrics: parseLibraryMetrics(row.metrics, `${type}.metrics`, standIns),
                    },
                };
            case "library.sync.completed":
                return {
                    event: {
                        type,
                        ...head,
                        total_listed: number(row.total_listed, `${type}.total_listed`),
                        new_count: number(row.new_count, `${type}.new_count`),
                        updated_count: number(row.updated_count, `${type}.updated_count`),
                        removed_count: number(row.removed_count, `${type}.removed_count`),
                        elapsed_ms: number(row.elapsed_ms, `${type}.elapsed_ms`),
                        quota_units_spent: number(
                            row.quota_units_spent,
                            `${type}.quota_units_spent`,
                        ),
                        // A server build older than this one sends neither field.
                        // Absent is read as "nothing was discarded" rather than
                        // refused, because a missing account of skips must never
                        // cost a person the catalogue they just watched arrive.
                        skipped_by_reason: countsByReason(
                            row.skipped_by_reason,
                            `${type}.skipped_by_reason`,
                        ),
                        skipped_total: number(row.skipped_total, `${type}.skipped_total`),
                        metrics: parseLibraryMetrics(row.metrics, `${type}.metrics`, standIns),
                    },
                };
            case "library.sync.unavailable":
                return {
                    event: {
                        type,
                        ...head,
                        code: text(row.code, `${type}.code`),
                        // The sentence IS the event. Without it the strip has
                        // nothing true to say, so it refuses rather than
                        // printing an empty reason.
                        message: str(row.message, `${type}.message`),
                        remedy: optStr(row.remedy, `${type}.remedy`),
                        partial_total: number(row.partial_total, `${type}.partial_total`),
                    },
                };
            case "library.sync.failed":
                return {
                    event: {
                        type,
                        ...head,
                        code: text(row.code, `${type}.code`),
                        message: str(row.message, `${type}.message`),
                        partial_total: number(row.partial_total, `${type}.partial_total`),
                        retryable: optBool(row.retryable, `${type}.retryable`, false),
                    },
                };
            case "classify.completed":
                return {
                    event: {
                        type,
                        ...head,
                        classified: number(row.classified, `${type}.classified`),
                        by_signal: (() => {
                            const map: Record<string, number> = {};
                            for (const [key, entry] of Object.entries(
                                obj(row.by_signal ?? {}, `${type}.by_signal`),
                            )) {
                                map[key] = number(entry, `${type}.by_signal.${key}`);
                            }
                            return map;
                        })(),
                        changed: number(row.changed, `${type}.changed`),
                    },
                };
            default:
                return null;
        }
    } catch (error: unknown) {
        return problemOf(error);
    }
}

/** One job-stream payload. Same rules as `parseSyncEvent`. */
export function parseJobEvent(payload: unknown): EventRead<JobEvent> {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
    const row = payload as Record<string, unknown>;
    const type = row.type;
    if (typeof type !== "string" || !type.startsWith("job.")) return null;

    try {
        switch (type) {
            case "job.started":
                return { event: { type, job: parseJobRow(row.job, `${type}.job`) } };
            case "job.item.started":
                return { event: { type, item: parseJobItemRow(row.item, `${type}.item`) } };
            case "job.item.finished":
                return {
                    event: {
                        type,
                        item: parseJobItemRow(row.item, `${type}.item`),
                        totals: parseTotals(row.totals, `${type}.totals`),
                    },
                };
            case "job.progress":
                return {
                    event: {
                        type,
                        totals: parseTotals(row.totals, `${type}.totals`),
                        progress_percent: number(
                            row.progress_percent,
                            `${type}.progress_percent`,
                        ),
                        elapsed_ms: number(row.elapsed_ms, `${type}.elapsed_ms`),
                        eta_seconds: optNum(row.eta_seconds, `${type}.eta_seconds`),
                    },
                };
            case "job.completed":
                return {
                    event: {
                        type,
                        job: parseJobRow(row.job, `${type}.job`),
                        totals: parseTotals(row.totals, `${type}.totals`),
                        elapsed_ms: number(row.elapsed_ms, `${type}.elapsed_ms`),
                    },
                };
            case "job.failed":
                return {
                    event: {
                        type,
                        job: parseJobRow(row.job, `${type}.job`),
                        code: text(row.code, `${type}.code`),
                        message: str(row.message, `${type}.message`),
                    },
                };
            default:
                return null;
        }
    } catch (error: unknown) {
        return problemOf(error);
    }
}
