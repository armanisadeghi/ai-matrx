"use client";

// features/block-ledger/BlockLedgerPage.tsx
//
// /acquisition/blocks — the whole register on one screen.

import Link from "next/link";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { BLOCK_LEDGER_LIST_CONFIG } from "./listConfig";

export function BlockLedgerPage() {
  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium">Blocks</h1>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            Everything we could not get, and what would unblock it
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs">
          <Link
            href="/scraper/batch"
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Read a list of pages
          </Link>
          <Link
            href="/libraries"
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Libraries
          </Link>
        </div>
      </PageHeader>
      <EntityListPage config={BLOCK_LEDGER_LIST_CONFIG} />
    </>
  );
}
