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
import { ExternalLink, FileText } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import type {
    EntityListConfig,
    EntityListController,
    EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { EntityBulkAction } from "@/lib/entity-list/selection";
import { CATALOG_COLUMNS } from "./columns";
import { createCatalogService } from "./service";
import type { VideoRow } from "../types";

export function createCatalogListConfig(options: {
    dispatch: AppDispatch;
    libraryId: string;
    bulkActions: EntityBulkAction<VideoRow>[];
    onOpenRow: (row: VideoRow) => void;
}): EntityListConfig<VideoRow> {
    const { dispatch, libraryId, bulkActions, onOpenRow } = options;

    function useCatalogRowActions(
        _list: EntityListController<VideoRow>,
    ): EntityRowActionsResult<VideoRow> {
        const menuFor = useCallback(
            (row: VideoRow) => () => ({
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
            }),
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
        serviceKey: `media-catalog:${libraryId}`,
        columns: CATALOG_COLUMNS,
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
        ],
        prefsDefaults: { sort: "published_at", direction: "desc" },
        emptyState: {
            title: "Nothing catalogued yet",
            description:
                "Bring this Library up to date and every video on the channel lists here in seconds.",
        },
    };
}
