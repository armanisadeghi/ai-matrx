"use client";

// app/(core)/lists/[id]/StoreListPage.tsx — A PICK LIST THAT LIVES IN THE NEW SYSTEM (lane LISTS-AFTER-SWITCH).
//
// After its organization switched its Data tables, a list lives in the record store as a Table of
// choices under the same id. /lists/<id> opens it as the new table page (the same screen a moved
// table opens as at /data/<id>) — its choices are the table's rows, edited there — under one line
// saying so. Same id, same address, no redirect.

import Link from "next/link";

import { LivesInTheNewSystem } from "@/app/(core)/data-v2/[tableId]/LivesInTheNewSystem";
import { LIST_LIVES_IN_NEW_SYSTEM } from "@/features/user-lists/where-lists-live";

export function StoreListPage({ listId }: { listId: string }) {
  return (
    <LivesInTheNewSystem tableId={listId} testId="list-lives-in-new-system">
      {LIST_LIVES_IN_NEW_SYSTEM}{" "}
      <Link href="/lists/v3" className="text-primary underline-offset-2 hover:underline">
        All lists
      </Link>
    </LivesInTheNewSystem>
  );
}
