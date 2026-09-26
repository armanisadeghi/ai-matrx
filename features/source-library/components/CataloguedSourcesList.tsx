"use client";

/**
 * A web-capture Library's Sources (SOURCE-CONVERGENCE §2.6 / §8.6).
 *
 * The capture ladder no longer writes `media.library_item` rows: a captured
 * page lands through the door as a Source and is filed in its Library by a
 * `processed_document → media_source_library` edge labelled
 * `catalogued_source`. So this list reads THOSE edges and the Sources they
 * point at — direct from Supabase under RLS (the client rule), never through
 * the catalog server's item read, which cannot see them.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabase/client";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { sourceHref } from "@/features/sources/api/sourcesApi";
import {
    SOURCE_KIND_LABEL,
    SOURCE_LIST_COLUMNS,
    captureWords,
    sourceKindGroup,
    type SourceListRow,
} from "@/features/sources/sourceRows";
import { CATALOGUED_SOURCE_LABEL, cataloguedSourceIds } from "../catalog/cataloguedSources";

export function CataloguedSourcesList({
    libraryId,
    organizationId,
}: {
    libraryId: string;
    organizationId: string | null;
}) {
    const router = useRouter();
    const links = useContainerLinks({
        containerType: "media_source_library",
        containerId: libraryId,
        orgId: organizationId,
    });
    const ids = cataloguedSourceIds(links.linksFor("processed_document"));
    const idsKey = ids.join(",");
    const [rows, setRows] = useState<SourceListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (links.status !== "ready") return undefined;
        let cancelled = false;
        if (!idsKey) {
            setRows([]);
            setLoading(false);
            setError(null);
            return undefined;
        }
        setLoading(true);
        void (async () => {
            // Chunked so a Library of hundreds never builds an over-long URL.
            const all = idsKey.split(",");
            const found: SourceListRow[] = [];
            for (let i = 0; i < all.length; i += 100) {
                const { data, error: readError } = await supabase
                    .schema("docproc")
                    .from("processed_documents")
                    .select(SOURCE_LIST_COLUMNS)
                    .in("id", all.slice(i, i + 100))
                    .is("deleted_at", null);
                if (cancelled) return;
                if (readError) {
                    setError("This Library's Sources could not be read.");
                    setLoading(false);
                    return;
                }
                found.push(...((data ?? []) as unknown as SourceListRow[]));
            }
            setRows(found);
            setError(null);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [idsKey, links.status, nonce]);

    const edgeError = links.status === "error" ? links.error : null;
    const shownError =
        error ??
        (edgeError ? `This Library's Sources could not be listed. ${edgeError}` : null);

    const columns: MatrxColumnDef<SourceListRow>[] = [
        {
            id: "name",
            header: "Name",
            accessorFn: (r) => r.name,
            cell: (r) => (
                <Link
                    href={sourceHref(r.id)}
                    className="block truncate font-medium text-foreground hover:underline"
                >
                    {r.name}
                </Link>
            ),
            filter: "text",
            width: 320,
        },
        {
            id: "kind",
            header: "Kind",
            accessorFn: (r) => SOURCE_KIND_LABEL[sourceKindGroup(r.source_kind)],
            filter: "select",
            width: 110,
        },
        {
            id: "captured",
            header: "Captured by",
            accessorFn: (r) => captureWords(r),
            filter: "select",
            width: 200,
        },
        {
            id: "created_at",
            header: "When",
            accessorFn: (r) => r.created_at,
            cell: (r) => (
                <span
                    title={new Date(r.created_at).toLocaleString()}
                    className="text-muted-foreground"
                >
                    {formatRelativeTime(r.created_at)}
                </span>
            ),
            filter: "date",
            width: 110,
        },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4 pt-[calc(var(--shell-header-h)+0.75rem)]">
            <p className="text-sm text-muted-foreground">
                Pages you captured and filed in this Library. Each one is a Source — open it
                to read, edit or process it.
            </p>
            {shownError ? (
                <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                        {shownError}
                        <Button
                            variant="link"
                            className="ml-1 h-auto p-0 text-sm"
                            onClick={() => {
                                void links.reload();
                                setNonce((n) => n + 1);
                            }}
                        >
                            Try again
                        </Button>
                    </span>
                </p>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col">
                <MatrxDataTable<SourceListRow>
                    tableId={`catalogued-sources:${CATALOGUED_SOURCE_LABEL}`}
                    data={rows}
                    columns={columns}
                    getRowId={(r) => r.id}
                    density="condensed"
                    viewTabs={false}
                    isLoading={(links.status !== "ready" && links.status !== "error") || loading}
                    defaultSort={{ id: "created_at", direction: "desc" }}
                    searchText={(r) => `${r.name} ${r.canonical_identity ?? ""}`}
                    toolbar={{
                        searchPlaceholder: "Search this Library",
                        titleCount: { value: rows.length, label: "Sources" },
                    }}
                    getRowHref={(r) => sourceHref(r.id)}
                    onRowOpen={(r) => router.push(sourceHref(r.id))}
                    detail={{ enabled: false }}
                    copy={false}
                    emptyState={{
                        title: "No Sources filed here yet",
                        description:
                            "Capture a page in your browser and save it to this Library — it appears here as a Source.",
                    }}
                />
            </div>
        </div>
    );
}
