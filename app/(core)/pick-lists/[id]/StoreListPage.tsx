"use client";

// app/(core)/pick-lists/[id]/StoreListPage.tsx — A PICK LIST'S PAGE.
//
// Every list lives in the record store as a Table of choices under the same id. /pick-lists/<id> opens it
// as the store's table page (records-ui TablePage, the very screen /data/<id> and /data/<id> are)
// — its choices are the table's rows, edited there — under one line saying what the page is.

import Link from "next/link";
import { useState } from "react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";

import { PickListChoicesEditor } from "@/features/data-tables/pick-lists/components/PickListChoicesEditor";

import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";
import { LIST_PAGE_LINE } from "@/features/data-tables/pick-lists/list-page-line";

export function StoreListPage({ listId }: { listId: string }) {
  const [view, setView] = useState<"choices" | "table">("choices");
  return (
    <div className="flex h-full flex-col">
      <p
        className="shrink-0 px-4 pb-1 pt-[calc(var(--shell-header-h)+0.25rem)] text-xs text-muted-foreground"
        data-testid="list-page-line"
      >
        {LIST_PAGE_LINE}{" "}
        <Link href="/pick-lists" className="text-primary underline-offset-2 hover:underline">
          All lists
        </Link>
      </p>
      <div className="shrink-0 px-4 pb-1">
        <SegmentedControl
          value={view}
          aria-label="Pick list view"
          onValueChange={(v: string) => setView(v === "table" ? "table" : "choices")}
          data={[
            { value: "choices", label: "Choices" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {/* The table page pads itself below the shell header; the line above already sits there. */}
      <div className="min-h-0 flex-1 [--shell-header-h:0px]">
        {view === "choices" ? <PickListChoicesEditor listId={listId} /> : <UnifiedDataTablePage tableId={listId} />}
      </div>
    </div>
  );
}
