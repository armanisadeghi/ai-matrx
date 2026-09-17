"use client";

/**
 * The saved Libraries list — the bottom half of the front door.
 *
 * Columns declare `sortable: false` and `filter: false` where the server
 * publishes no ordering or filtering for them (the contract's
 * `GET /media/libraries` takes `visibility`, `adapter` and `q` only). The
 * column policy's escape hatch exists for exactly this: an explicit refusal is
 * honest, a client-side sort over the page in hand is a lie.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, RefreshCw, Trash2 } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import type {
    EntityListConfig,
    EntityListController,
    EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MediaApiError, deleteLibrary } from "../api";
import { formatCount } from "../format";
import type { LibraryRow } from "../types";
import { LIBRARY_LIST_SCOPES, createLibraryListService } from "./service";

export function libraryHref(row: LibraryRow): string {
    return `/libraries/${row.id}`;
}

const SYNC_STATUS_WORDS: Record<LibraryRow["sync_status"], string> = {
    never_synced: "Not catalogued yet",
    syncing: "Cataloguing now",
    idle: "Catalogued",
    failed: "Last catalogue failed",
};

const LIBRARY_COLUMNS: EntityColumnSpec<LibraryRow>[] = [
    {
        id: "name",
        label: "Library",
        locked: true,
        phone: "title",
        column: {
            id: "name",
            accessorKey: "name",
            header: "Library",
            sortable: false,
            filter: false,
            href: libraryHref,
            cell: (row) => (
                <div className="flex min-w-0 items-center gap-2">
                    {row.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={row.thumbnail_url}
                            alt=""
                            className="size-6 shrink-0 rounded-full object-cover"
                        />
                    ) : null}
                    <span className="block truncate font-medium">{row.name}</span>
                    {row.handle ? (
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                            {row.handle}
                        </span>
                    ) : null}
                </div>
            ),
        },
    },
    {
        id: "item_count",
        label: "Sources",
        phone: "primary",
        column: {
            id: "item_count",
            accessorKey: "item_count",
            header: "Sources",
            sortable: false,
            filter: false,
            cell: (row) =>
                row.item_count == null ? (
                    <Muted>—</Muted>
                ) : (
                    <span className="tabular-nums">{formatCount(row.item_count)}</span>
                ),
        },
    },
    {
        id: "sync_status",
        label: "State",
        phone: "primary",
        column: {
            id: "sync_status",
            accessorKey: "sync_status",
            header: "State",
            sortable: false,
            filter: false,
            cell: (row) =>
                row.sync_status === "failed" ? (
                    <span
                        className="inline-flex items-center gap-1 text-destructive"
                        title={row.sync_error ?? undefined}
                    >
                        <CircleAlert className="size-3.5 shrink-0" />
                        {SYNC_STATUS_WORDS.failed}
                    </span>
                ) : (
                    <Badge variant="outline" className="py-0 text-[11px]">
                        {SYNC_STATUS_WORDS[row.sync_status]}
                    </Badge>
                ),
        },
    },
    {
        id: "last_synced_at",
        label: "Last brought up to date",
        phone: "meta",
        column: {
            id: "last_synced_at",
            accessorKey: "last_synced_at",
            header: "Last brought up to date",
            sortable: false,
            filter: false,
            cell: (row) => timeCell(row.last_synced_at),
        },
    },
    {
        id: "created_at",
        label: "Added",
        phone: "meta",
        defaultHidden: true,
        column: {
            id: "created_at",
            accessorKey: "created_at",
            header: "Added",
            sortable: false,
            filter: false,
            cell: (row) => timeCell(row.created_at),
        },
    },
];

function useLibraryRowActions(
    list: EntityListController<LibraryRow>,
): EntityRowActionsResult<LibraryRow> {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const onOpenRow = useCallback(
        (row: LibraryRow) => router.push(libraryHref(row)),
        [router],
    );

    const menuFor = useCallback(
        (row: LibraryRow) => () => ({
            header: { title: row.name },
            sections: [
                {
                    id: "open",
                    items: [
                        {
                            id: "open",
                            label: "Open",
                            onSelect: () => router.push(libraryHref(row)),
                        },
                        {
                            id: "bring-up-to-date",
                            label: "Bring up to date",
                            icon: RefreshCw,
                            onSelect: () => router.push(`${libraryHref(row)}?resync=1`),
                        },
                    ],
                },
                {
                    id: "danger",
                    label: "Danger",
                    items: [
                        {
                            id: "remove",
                            label: "Remove this Library",
                            icon: Trash2,
                            tone: "destructive" as const,
                            onSelect: async () => {
                                const ok = await confirm({
                                    title: `Remove ${row.name}?`,
                                    description:
                                        `This removes the Library and its list of ${formatCount(row.item_count ?? 0)} Sources from your workspace. ` +
                                        "The catalogued videos and any transcripts already made from them are kept — they are shared across the platform — so nothing you have transcribed is lost, and re-adding the channel finds them again.",
                                    confirmLabel: "Remove Library",
                                    variant: "destructive" as const,
                                });
                                if (!ok) return;
                                try {
                                    await deleteLibrary(dispatch, row.id);
                                    list.removeRow(row.id);
                                    toast.success(`${row.name} was removed.`);
                                } catch (error) {
                                    toast.error(
                                        error instanceof MediaApiError
                                            ? error.message
                                            : "That Library could not be removed.",
                                    );
                                }
                            },
                        },
                    ],
                },
            ],
        }),
        [dispatch, list, router],
    );

    return { actions: { menuFor, onOpenRow } };
}

/**
 * Built per mount rather than as a module constant, because the service needs
 * the store's dispatch (the ONE door to the server owns auth and base URL).
 */
export function createLibraryListConfig(
    dispatch: AppDispatch,
    organizationId: string | null,
): EntityListConfig<LibraryRow> {
    return {
        surfaceKey: "source-libraries-browse",
        entityLabel: { singular: "Library", plural: "Libraries" },
        sourceFeature: "transcription",
        scopes: LIBRARY_LIST_SCOPES,
        service: createLibraryListService(dispatch),
        // 🚨 THE ACTIVE ORGANIZATION IS PART OF WHAT THIS SERVICE WAS BUILT
        // FROM. It resolves AFTER the first render (cookie → default → personal,
        // see lib/organizations/resolveActiveOrgContext.ts), and every call to
        // the server carries it — so a constant key here means the list asks
        // once, org-less, is refused with "Select an organization before
        // sending this request", and never asks again. Measured on the live
        // page before this line existed.
        serviceKey: `media-libraries:${organizationId ?? "none"}`,
        columns: LIBRARY_COLUMNS,
        prefsVersion: 1,
        getRowId: (row) => row.id,
        getRowName: (row) => row.name,
        door: { hrefFor: libraryHref },
        useRowActions: useLibraryRowActions,
        // `media.source_library` soft-deletes, but the contract publishes no
        // archived axis on the list endpoint — so the affordance is switched
        // off rather than rendered over a query that cannot honour it.
        supportsArchived: false,
        facetSections: [],
        emptyState: {
            title: "No Libraries yet",
            description:
                "Paste a YouTube channel, @handle, playlist or any video link above. The whole catalogue lists in seconds, separated into longs, Shorts and live.",
        },
    };
}
