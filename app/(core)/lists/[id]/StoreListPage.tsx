"use client";

// app/(core)/lists/[id]/StoreListPage.tsx — A PICK LIST'S PAGE.
//
// Every list lives in the record store as a Table of choices under the same id. /lists/<id> opens it
// as the store's table page (records-ui TablePage, the very screen /data/<id> and /data-v2/<id> are)
// — its choices are the table's rows, edited there — under one line saying what the page is.

import { useMemo } from "react";
import Link from "next/link";

import UnifiedDataTableRoute from "@/app/(core)/data-v2/[tableId]/page";
import { LIST_PAGE_LINE } from "@/features/user-lists/list-page-line";

export function StoreListPage({ listId }: { listId: string }) {
  const params = useMemo(() => Promise.resolve({ tableId: listId }), [listId]);
  return (
    <div className="flex h-full flex-col">
      <p
        className="shrink-0 px-4 pb-1 pt-[calc(var(--shell-header-h)+0.25rem)] text-xs text-muted-foreground"
        data-testid="list-page-line"
      >
        {LIST_PAGE_LINE}{" "}
        <Link href="/lists" className="text-primary underline-offset-2 hover:underline">
          All lists
        </Link>
      </p>
      {/* The table page pads itself below the shell header; the line above already sits there. */}
      <div className="min-h-0 flex-1 [--shell-header-h:0px]">
        <UnifiedDataTableRoute params={params} />
      </div>
    </div>
  );
}
