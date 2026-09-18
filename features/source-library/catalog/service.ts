"use client";

/**
 * The Sources inside one Library, as an entity-list service triple.
 *
 * WHERE THE FACET COUNTS COME FROM. The contract publishes no facet endpoint
 * for videos — but it publishes §5's metrics, computed server-side over the
 * SAME filter object the list uses. So the counts on the Type, Captions and
 * Transcript chips are the server's own numbers over the current narrowing, not
 * a tally of the 25 rows this page happens to hold. Length and date are offered
 * as buckets with no counts rather than with invented ones.
 *
 * THERE ARE NO SCOPE TABS on this surface and that is deliberate: the Library
 * IS the scope. Rendering a "Mine" tab over a shared platform cache of videos
 * would be a word that means something different here from everywhere else.
 */

import type { AppDispatch } from "@/lib/redux/store";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
    EntityFacets,
    EntityFilters,
    EntityListPage,
    EntityListQuery,
    EntityScopeCounts,
    EntityListSort,
} from "@/lib/entity-list/types";
import { MediaApiError, getLibraryMetrics, listVideos } from "../api";
import type {
    MediaKind,
    TranscriptStatus,
    VideoQuery,
    VideoRow,
} from "../types";

export const LENGTH_BUCKETS = [
    { value: "lt1m", label: "Under a minute", min: 0, max: 59 },
    { value: "1-5m", label: "1–5 minutes", min: 60, max: 300 },
    { value: "5-20m", label: "5–20 minutes", min: 300, max: 1200 },
    { value: "20-60m", label: "20–60 minutes", min: 1200, max: 3600 },
    { value: "gt1h", label: "Over an hour", min: 3600, max: undefined },
] as const;

export const PUBLISHED_BUCKETS = [
    { value: "7d", label: "Last 7 days", days: 7 },
    { value: "30d", label: "Last 30 days", days: 30 },
    { value: "90d", label: "Last 90 days", days: 90 },
    { value: "1y", label: "Last year", days: 365 },
    { value: "3y", label: "Last 3 years", days: 1095 },
] as const;

const SORT_COLUMNS: Record<string, VideoQuery["order"]> = {
    published_at: "published_at",
    view_count: "view_count",
    duration_seconds: "duration_seconds",
    title: "title",
};

function selected(filters: EntityFilters, key: string): string[] {
    const value = filters[key];
    if (!value) return [];
    if (value.kind === "select") return value.values;
    if (value.kind === "boolean") return [String(value.value)];
    if (value.kind === "text") return value.value ? [value.value] : [];
    return [];
}

/** ONE translation from the shell's filter bag to the contract's query. */
export function toVideoQuery(
    query: EntityListQuery,
    sort?: EntityListSort,
): VideoQuery {
    const out: VideoQuery = {};
    const kinds = selected(query.filters, "media_kind");
    if (kinds.length) out.media_kind = kinds as MediaKind[];

    const captions = selected(query.filters, "has_captions");
    // Both values selected means "either", which is no narrowing at all.
    if (captions.length === 1) out.has_captions = captions[0] === "true";

    const transcripts = selected(query.filters, "transcript_status");
    if (transcripts.length) out.transcript_status = transcripts as TranscriptStatus[];

    const lengths = selected(query.filters, "length");
    if (lengths.length) {
        const buckets = LENGTH_BUCKETS.filter((b) => lengths.includes(b.value));
        if (buckets.length) {
            out.min_duration_seconds = Math.min(...buckets.map((b) => b.min));
            const maxes = buckets.map((b) => b.max);
            if (!maxes.includes(undefined)) {
                out.max_duration_seconds = Math.max(...(maxes as number[]));
            }
        }
    }

    const published = selected(query.filters, "published_at");
    if (published.length) {
        // The widest selected window is the honest reading of "any of these".
        const days = Math.max(
            ...PUBLISHED_BUCKETS.filter((b) => published.includes(b.value)).map(
                (b) => b.days,
            ),
        );
        if (Number.isFinite(days)) {
            out.published_after = new Date(
                Date.now() - days * 24 * 60 * 60 * 1000,
            ).toISOString();
        }
    }

    if (query.search) out.q = query.search;
    if (sort) {
        out.order = SORT_COLUMNS[sort.sort] ?? "published_at";
        out.direction = sort.direction;
    }
    return out;
}

/** See browse/service.ts: a 404 is a missing endpoint, never a refusal. */
function rethrow(error: unknown): never {
    if (error instanceof MediaApiError) {
        // 🚨 A NOT-YET NEVER REACHES A PERSON AS A SENTENCE. The transport
        // refuses every authenticated call until the active organization
        // resolves, one beat after first render, and its refusal is written for
        // a developer: "Select an organization before sending this request."
        // The shell re-asks the moment the organization lands (it is part of
        // the service key), so this is a retryable, still-starting condition
        // wearing copy that belongs to nobody on this screen. It gets copy of
        // its own, and it is always retryable.
        if (
            error.code === "organization_context_required" ||
            error.code === "organization_context_invalid"
        ) {
            throw Object.assign(
                new Error("Still opening your workspace — one moment."),
                { refused: false, retryable: true, code: error.code },
            );
        }
        const missingEndpoint = error.status === 404 && !error.hasServerSentence;
        const message = missingEndpoint
            ? "This server does not answer at this Library's address yet, so its Sources cannot be listed. It arrives with the Media Source Catalog server release."
            : error.message;
        throw Object.assign(new Error(message), {
            refused: error.status === 401 || error.status === 403,
            retryable: missingEndpoint || error.retryable,
            code: error.code,
        });
    }
    throw error;
}

export function createCatalogService(
    dispatch: AppDispatch,
    libraryId: string,
): EntityListService<VideoRow> {
    return {
        async fetchPage(query, sort): Promise<EntityListPage<VideoRow>> {
            try {
                const limit = sort.pageSize || 25;
                const response = await listVideos(dispatch, libraryId, {
                    ...toVideoQuery(query, sort),
                    limit,
                    offset: (query.page - 1) * limit,
                });
                // `filtered_total` is what THIS query matches; `total` is the
                // whole Library. The list's total must be the filtered one, or
                // paging walks off the end of a narrowed set.
                return { rows: response.videos, total: response.filtered_total };
            } catch (error) {
                return rethrow(error);
            }
        },

        async fetchCounts(): Promise<EntityScopeCounts> {
            // No scope tabs on this surface — the Library is the scope.
            return { byKind: {}, narrow: {} };
        },

        async fetchFacets(query): Promise<EntityFacets> {
            try {
                const { value: metrics } = await getLibraryMetrics(dispatch, libraryId, {
                    ...toVideoQuery(query),
                });
                return {
                    byKind: {
                        media_kind: Object.entries(metrics.counts_by_kind ?? {})
                            .filter(([, count]) => count > 0)
                            .map(([value, count]) => ({ value, count })),
                        has_captions: [
                            {
                                value: "true",
                                count: metrics.caption_coverage?.with_captions ?? 0,
                            },
                            {
                                value: "false",
                                count: metrics.caption_coverage?.without_captions ?? 0,
                            },
                        ].filter((option) => option.count > 0),
                        transcript_status: Object.entries(metrics.transcripts ?? {})
                            .filter(([, count]) => count > 0)
                            .map(([value, count]) => ({ value, count })),
                    },
                };
            } catch {
                // An empty facet payload is a SAFE SHAPE, never evidence that a
                // read returned zero values — the shell holds its own
                // `facetsError` for that and suppresses stale values.
                return { byKind: {} };
            }
        },
    };
}
