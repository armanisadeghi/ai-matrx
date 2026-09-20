"use client";

/**
 * The saved Libraries list — the bottom half of the front door.
 *
 * Columns declare `sortable: false` and `filter: false` where the server
 * publishes no ordering or filtering for them. The column policy's escape hatch
 * exists for exactly this: an explicit refusal is honest, a client-side sort
 * over the page in hand is a lie.
 *
 * THE URL IS THIS LIST'S QUERY (`urlState: true`). The search box, the four
 * lane tabs and the page all write themselves into `?q=` / `?scope=` /
 * `?page=` through the shell's one encoder (`lib/entity-list/urlQuery.ts`), so
 * a reload keeps what the person did and the Acquisition Console can address a
 * single kind of Library by link. No param is coined here: `filters` carries
 * the adapter in the same `select` bag a column header produces.
 *
 * It was off until 2026-09-20 for a real reason (D343, now closed):
 * `GET /media/libraries` published `visibility`, `adapter` and `q` in
 * API-CONTRACT.md §3 and DECLARED none of them, so FastAPI dropped all three
 * and answered 200 with the whole unfiltered list — the search box did not
 * narrow, the four lane tabs served identical rows, and D10's per-lane counts
 * were four identical totals. Putting a `?q=` in the URL while the screen
 * ignored it would have been the lie made linkable. aidream `d7093434f6`
 * declares all three and counts the filtered set (contract 0.6.0), so the URL
 * and the screen now say the same thing.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import type {
    EntityListConfig,
    EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { Badge } from "@/components/ui/badge";
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

function useLibraryRowActions(): EntityRowActionsResult<LibraryRow> {
    const router = useRouter();

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
                // 🚨 NO "Remove this Library" ITEM, AND THAT IS DELIBERATE.
                // `DELETE /media/libraries/{id}` is published in
                // API-CONTRACT.md §3 but §0.5's "NOT working" table says
                // plainly "Not implemented" — and the router has never carried
                // the route. So this menu spent its life offering a
                // confirm-dialog and a 404: the person was told what removal
                // would keep, said yes, and got an error toast. A control is
                // absent or honest, never dead, so it is absent until the
                // server ships the route and `pnpm sync-types` puts it in
                // `paths`. Filed in FOUND_DEFECTS.md.
            ],
        }),
        [router],
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
        urlState: true,
        getRowId: (row) => row.id,
        getRowName: (row) => row.name,
        door: { hrefFor: libraryHref },
        useRowActions: useLibraryRowActions,
        // `media.source_library` soft-deletes, but the contract publishes no
        // archived axis on the list endpoint — so the affordance is switched
        // off rather than rendered over a query that cannot honour it.
        supportsArchived: false,
        // The contract publishes no facet endpoint for Libraries, so there are
        // no chips to render and `fetchFacets` says so by answering `{}`. An
        // adapter filter that arrives by link is therefore not invisible: the
        // shell's own Filters control turns primary, carries the active count,
        // and offers Reset filters (`lib/entity-list/components/EntityFilterPanel.tsx`),
        // which is the generic affordance every filter bag gets.
        facetSections: [],
        emptyState: {
            title: "No Libraries yet",
            // D6b (jobs-bar cold-walk-12): this is the door BEFORE any Library
            // exists, so there is no adapter to read a noun from yet — but
            // naming only YouTube here, while the paste box right above it
            // already accepts a podcast, a blog, or a deck, told a person
            // pasting any of those that they were in the wrong place.
            description:
                "Paste a YouTube channel, a podcast feed, a blog, or a slide deck link above. The whole catalogue lists in seconds.",
        },
    };
}
