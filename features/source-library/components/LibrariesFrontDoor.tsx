"use client";

/**
 * /libraries — the front door.
 *
 * ONE paste box and the list of what you already have. The box lives in the
 * shell's `notice` slot (above the scope tabs) rather than in a card of its
 * own, so it is the first thing under the header and the list below it never
 * moves when a Library is added.
 */

import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { createLibraryListConfig } from "../browse/listConfig";
import { CatalogPasteBox } from "./CatalogPasteBox";

export function LibrariesFrontDoor() {
    const dispatch = useAppDispatch();
    const config = createLibraryListConfig(dispatch);

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
                        <CatalogPasteBox />
                    </div>
                }
            />
        </>
    );
}
