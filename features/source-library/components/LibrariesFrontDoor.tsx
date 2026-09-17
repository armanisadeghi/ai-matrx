"use client";

/**
 * /libraries — the front door.
 *
 * ONE paste box and the list of what you already have. The box lives in the
 * shell's `notice` slot (above the scope tabs) rather than in a card of its
 * own, so it is the first thing under the header and the list below it never
 * moves when a Library is added.
 */

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { createLibraryListConfig } from "../browse/listConfig";
import { CatalogPasteBox } from "./CatalogPasteBox";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE HANDOFF DOES NOT DROP THE CONTEXT. Masterwork's Sources panel and the
 * "how do you want to do this" step both send people here with
 * `?from=rulebook&rulebook_id=<id>`. Arriving at a bare paste box after
 * pressing "Bring a whole channel" reads as a wrong turn, so say in one plain
 * sentence what this page does first and what happens next — and keep the way
 * back open (THE DOOR LAW), since the id came with them.
 *
 * No Rulebook name is invented here: we do not read that row, so the sentence
 * says "the Rulebook you came from".
 */
function RulebookHandoffNotice() {
    const params = useSearchParams();
    if (params.get("from") !== "rulebook") return null;

    const rulebookId = params.get("rulebook_id");
    const backHref =
        rulebookId && UUID_RE.test(rulebookId)
            ? `/masterwork/${rulebookId}/sources`
            : null;

    return (
        <div className="mb-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    Paste the channel here first: we catalogue every video as a
                    Source in a Library, and from there you can send the ones
                    you want to{" "}
                    {backHref
                        ? "the Rulebook you came from"
                        : "a Rulebook"}
                    .
                </p>
            </div>
            {backHref ? (
                <Link
                    href={backHref}
                    data-tap-target
                    className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:min-h-0"
                >
                    <ArrowLeft className="size-3.5" />
                    Back to the Rulebook
                </Link>
            ) : null}
        </div>
    );
}

export function LibrariesFrontDoor() {
    const dispatch = useAppDispatch();
    const organizationId = useAppSelector(selectOrganizationId);
    const config = createLibraryListConfig(dispatch, organizationId);

    return (
        <>
            <PageHeader>
                <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-sm font-medium">Libraries</h1>
                    <span className="hidden truncate text-xs text-muted-foreground md:inline">
                        A whole channel, catalogued
                    </span>
                </div>
            </PageHeader>
            <EntityListPage
                config={config}
                notice={
                    <div className="mx-auto w-full max-w-3xl pb-2">
                        <Suspense fallback={null}>
                            <RulebookHandoffNotice />
                        </Suspense>
                        <CatalogPasteBox />
                    </div>
                }
            />
        </>
    );
}
