"use client";

/**
 * The Sources inside one Library, as an entity-list config.
 *
 * `bulkActions` are passed IN because they are the server's registry, not this
 * module's opinion (see hooks/useActionRunner.tsx). `selectAllMatching` is on
 * because the promise is one this surface can keep: the shell resolves it
 * through THIS service, and the contract's selection descriptor is the same
 * filter object, so "everything matching" reaches the server as a filter rather
 * than as a thousand ids.
 */

import { useCallback } from "react";
import { ExternalLink, FileText, ListChecks } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import type {
    EntityListConfig,
    EntityListController,
    EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { EntityBulkAction } from "@/lib/entity-list/selection";
import { catalogColumns } from "./columns";
import { createCatalogService } from "./service";
import { actionLabel } from "../format";
import { sourceVocabulary } from "../vocabulary";
import type { LibraryRow, VideoRow } from "../types";

export function createCatalogListConfig(options: {
    dispatch: AppDispatch;
    libraryId: string;
    /** The active organization — part of what this service was built FROM, so a
     *  list built before it resolved re-asks the moment it lands. */
    organizationId: string | null;
    bulkActions: EntityBulkAction<VideoRow>[];
    onOpenRow: (row: VideoRow) => void;
    /** §8's labels, keyed by Action key — the SERVER'S words, never a list held
     *  here. Absent (the registry has not answered yet) shows the key. */
    actionLabels?: Record<string, string>;
    /** §4.3 — open the job an outcome came from, in the panel that already
     *  exists for it. Without this the row could name what happened and give a
     *  person nowhere to go and read the rest of it. */
    onOpenJob?: (jobId: string) => void;
    /** This Library's row, so the noun and the empty state speak the adapter's
     *  own words (D6b, jobs-bar cold-walk-12) — never YouTube's "video(s)" over
     *  a podcast or a blog. `null` while the mount read has not landed yet. */
    library?: LibraryRow | null;
    /**
     * D6 (jobs-bar cold-walk-12, 2026-09-19): bumped every time a sync lands
     * new rows (`library.sync.completed`). `serviceKey` is what actually makes
     * this shell re-ask a service — see `lib/entity-list/useEntityList.ts`'s
     * own header comment on `serviceKey`. This screen's row read used to be
     * keyed only by `libraryId`/`organizationId`, so a page that just watched
     * the sync banner count to 507 kept showing the FIRST read's zero rows
     * forever: nothing in the query ever changed, so nothing ever re-asked.
     * Folding this in is the fix, in the shell's own idiom.
     */
    refreshToken?: number;
    /**
     * D6's belt-and-suspenders half: while the sync banner (`sync.listed`,
     * `LibraryMetricsHeader`) is reporting rows for THIS library, the honest
     * empty state can never be "Nothing catalogued yet" — that sentence is a
     * flat lie one banner-height above a stat block saying otherwise. Passed
     * by `LibraryPage` from the live sync state; omitted (or `false`) uses the
     * ordinary empty state.
     */
    syncReportsRows?: boolean;
}): EntityListConfig<VideoRow> {
    const {
        dispatch,
        libraryId,
        organizationId,
        bulkActions,
        onOpenRow,
        actionLabels,
        onOpenJob,
        library = null,
        refreshToken,
        syncReportsRows,
    } = options;
    const vocabulary = sourceVocabulary(library);
    // The Library's kind is only KNOWN once its row is here; until then the
    // neutral vocabulary means "not yet", never "this axis does not exist".
    // Same gate the metrics header uses for its tiles and its chart title.
    const kindKnown = library !== null;

    function useCatalogRowActions(
        _list: EntityListController<VideoRow>,
    ): EntityRowActionsResult<VideoRow> {
        const menuFor = useCallback(
            (row: VideoRow) => () => {
                const outcome = row.last_action;
                return {
                    header: { title: row.title },
                    sections: [
                        {
                            id: "open",
                            items: [
                                {
                                    id: "open",
                                    label: "Open this Source",
                                    icon: FileText,
                                    onSelect: () => onOpenRow(row),
                                },
                                // §4.3 — the way BACK from an outcome to the run
                                // that produced it. Present only when there is a
                                // job to open: an item that names no job gets no
                                // entry rather than a dead one.
                                ...(outcome?.job_id && onOpenJob
                                    ? [
                                          {
                                              id: "open-job",
                                              label: `Open the ${actionLabel(
                                                  outcome.action_key,
                                                  actionLabels,
                                              )} run`,
                                              icon: ListChecks,
                                              onSelect: () => onOpenJob(outcome.job_id!),
                                          },
                                      ]
                                    : []),
                                {
                                    id: "youtube",
                                    kind: "link" as const,
                                    label: "Watch on YouTube",
                                    icon: ExternalLink,
                                    href: row.url,
                                    target: "_blank" as const,
                                },
                            ],
                        },
                    ],
                };
            },
            [],
        );

        return { actions: { menuFor, onOpenRow } };
    }

    return {
        // Keyed by library so one person's column choices on a 4,000-video
        // channel do not become their choices on a 12-video playlist.
        surfaceKey: `source-library-catalog:${libraryId}`,
        entityLabel: { singular: "Source", plural: "Sources" },
        sourceFeature: "transcription",
        // No scope tabs: the Library IS the scope. See ./service.ts.
        scopes: [],
        service: createCatalogService(dispatch, libraryId),
        serviceKey: `media-catalog:${libraryId}:${organizationId ?? "none"}:${refreshToken ?? 0}`,
        columns: catalogColumns({ actionLabels, vocabulary, kindKnown }),
        prefsVersion: 1,
        getRowId: (row) => row.id,
        getRowName: (row) => row.title,
        useRowActions: useCatalogRowActions,
        urlState: true,
        // `research.youtube_video` is a shared platform cache with no archive
        // axis of its own — the affordance is switched off rather than lying.
        supportsArchived: false,
        bulkActions,
        bulkSelection: { noun: vocabulary.item.one, selectAllMatching: true },
        facetSections: [
            // A FILTER FOLLOWS THE MEDIA KIND, exactly as its column does
            // (jobs-bar cold-walk-13, Friction; see `catalog/columns.tsx`).
            // A "Type: Long / Short / Live" chip over a podcast filters by
            // YouTube's duration threshold, and a Captions chip over text
            // filters by something that does not exist — so both are absent
            // where `vocabulary.ts` says the axis is not real, rather than
            // offering a narrowing that can only return everything or
            // nothing.
            ...(!kindKnown || vocabulary.kindSplit !== null
                ? [
                      {
                          facet: "media_kind" as const,
                          filterId: "media_kind",
                          label: "Type",
                          noneLabel: "Unclassified",
                          countInLabel: false,
                      },
                  ]
                : []),
            ...(!kindKnown || vocabulary.transcribable
                ? [
                      {
                          facet: "has_captions" as const,
                          filterId: "has_captions",
                          label: "Captions",
                          noneLabel: "Unknown",
                          countInLabel: false,
                          formatValue: (value: string) =>
                              value === "true" ? "Has captions" : "No captions",
                      },
                  ]
                : []),
            {
                facet: "transcript_status",
                filterId: "transcript_status",
                label: "Transcript",
                noneLabel: "Not transcribed",
                countInLabel: false,
            },
            // §4.3 — the two questions a person actually asks after running
            // something over fifty Sources: "which ones went" and "which ones
            // did not". Two chips rather than one combined vocabulary, because
            // "sent to the Rulebook" is Action + outcome and collapsing them
            // would coin a word for every pair.
            {
                facet: "action_key",
                filterId: "action_key",
                label: "Action",
                noneLabel: "Nothing has run",
                countInLabel: false,
                formatValue: (value) => actionLabel(value, actionLabels),
            },
            {
                facet: "action_status",
                filterId: "action_status",
                label: "Result",
                noneLabel: "Nothing has run",
                countInLabel: false,
            },
        ],
        prefsDefaults: { sort: "published_at", direction: "desc" },
        // D6: never the "nothing here" sentence while the sync banner is
        // reporting rows for this exact Library — that combination is not an
        // edge case here, it is what a person sees on every fresh catalogue
        // for the beat between the banner landing and this list's own re-read
        // catching up. `refreshToken` above is the real fix (the list now
        // actually re-asks); this is the guard for the read still in flight.
        emptyState: syncReportsRows
            ? {
                  title: `Bringing your ${vocabulary.item.many.toLowerCase()} into view`,
                  description:
                      "The catalogue just finished listing this Library's rows. Finishing the read for this table now — they will appear in a moment.",
              }
            : {
                  title: "Nothing catalogued yet",
                  description: `Bring this Library up to date and every ${vocabulary.item.one} on the channel lists here in seconds.`,
              },
    };
}
