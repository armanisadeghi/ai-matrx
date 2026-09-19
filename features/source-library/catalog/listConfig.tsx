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
import type { VideoRow } from "../types";

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
}): EntityListConfig<VideoRow> {
    const {
        dispatch,
        libraryId,
        organizationId,
        bulkActions,
        onOpenRow,
        actionLabels,
        onOpenJob,
    } = options;

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
        serviceKey: `media-catalog:${libraryId}:${organizationId ?? "none"}`,
        columns: catalogColumns({ actionLabels }),
        prefsVersion: 1,
        getRowId: (row) => row.id,
        getRowName: (row) => row.title,
        useRowActions: useCatalogRowActions,
        urlState: true,
        // `research.youtube_video` is a shared platform cache with no archive
        // axis of its own — the affordance is switched off rather than lying.
        supportsArchived: false,
        bulkActions,
        bulkSelection: { noun: "video", selectAllMatching: true },
        facetSections: [
            {
                facet: "media_kind",
                filterId: "media_kind",
                label: "Type",
                noneLabel: "Unclassified",
                countInLabel: false,
            },
            {
                facet: "has_captions",
                filterId: "has_captions",
                label: "Captions",
                noneLabel: "Unknown",
                countInLabel: false,
                formatValue: (value) =>
                    value === "true" ? "Has captions" : "No captions",
            },
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
        emptyState: {
            title: "Nothing catalogued yet",
            description:
                "Bring this Library up to date and every video on the channel lists here in seconds.",
        },
    };
}
