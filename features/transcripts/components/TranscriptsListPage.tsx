"use client";

// features/transcripts/components/TranscriptsListPage.tsx
//
// /transcripts — the SECOND consumer of the generic entity-list shell
// (lib/entity-list). Everything transcripts-specific lives in
// ../browse/listConfig.tsx; this file is the config plus this page's slots.
//
// Replaces the sectioned hub (per-kind queries, client-side sort/filter,
// bespoke 780-line table): rows now come from the trx_list_scoped RPC as ONE
// list with a `kind` column, paged/filtered/sorted/counted server-side.

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { transcriptListConfig } from "../browse/listConfig";
import { TranscriptsListHeader } from "./TranscriptsListHeader";
import { TranscriptsSurfaceGuide } from "./TranscriptsSurfaceGuide";

export function TranscriptsListPage() {
  const newButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/transcripts/new" aria-label="New transcript">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New</span>
      </Link>
    </Button>
  );

  // The empty state is the ONE place the surface wayfinding renders — it never
  // sits above the list, so a user with transcripts sees zero page shift.
  const emptyAction = (
    <>
      {newButton}
      <TranscriptsSurfaceGuide />
    </>
  );

  return (
    <>
      <PageHeader>
        <TranscriptsListHeader />
      </PageHeader>
      <EntityListPage
        config={transcriptListConfig}
        headerActions={newButton}
        emptyAction={emptyAction}
      />
    </>
  );
}
