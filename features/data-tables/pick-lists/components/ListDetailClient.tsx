"use client";

// features/data-tables/pick-lists/components/ListDetailClient.tsx — A PICK LIST HANDED TO A HOST (the List
// Manager window, the pick list tool's expanded view). Every list lives in the record store as a
// Table of choices and is edited on its own page, /pick-lists/<id> (the store's table page); a host
// shows the list and the way there.

import Link from "next/link";

import type { UserListWithItems } from "../types";
import { listAddress } from "../where-lists-live";

interface ListDetailClientProps {
  list: UserListWithItems;
  /** The signed-in person (hosts pass it; the list's own page decides who edits). */
  userId?: string | null;
}

export function ListDetailClient({ list }: ListDetailClientProps) {
  return (
    <div className="m-4 flex flex-col items-start gap-2 rounded-md border border-dashed p-6" data-testid="list-detail">
      <p className="text-sm font-medium">{list.list_name}</p>
      <Link href={listAddress(list.list_id)} className="text-sm text-primary underline-offset-2 hover:underline">
        Open the list
      </Link>
    </div>
  );
}
