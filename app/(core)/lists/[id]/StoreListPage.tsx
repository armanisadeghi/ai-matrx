"use client";

// app/(core)/lists/[id]/StoreListPage.tsx — A PICK LIST'S PAGE.
//
// Every list lives in the record store as a Table of choices under the same id. /lists/<id> opens it
// as the store's table page (the same screen /data/<id> is) — its choices are the table's rows,
// edited there — under one line saying what the page is.

import Link from "next/link";

import { LivesInTheNewSystem } from "@/app/(core)/data-v2/[tableId]/LivesInTheNewSystem";
import { LIST_PAGE_LINE } from "@/features/user-lists/where-lists-live";

export function StoreListPage({ listId }: { listId: string }) {
  return (
    <LivesInTheNewSystem tableId={listId} testId="list-page-line">
      {LIST_PAGE_LINE}{" "}
      <Link href="/lists" className="text-primary underline-offset-2 hover:underline">
        All lists
      </Link>
    </LivesInTheNewSystem>
  );
}
