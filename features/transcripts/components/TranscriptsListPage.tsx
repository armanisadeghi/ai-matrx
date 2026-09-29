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
import { useSearchParams } from "next/navigation";
import { ArrowRight, Library, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { transcriptListConfig } from "../browse/listConfig";
import { TranscriptsListHeader } from "./TranscriptsListHeader";
import { TranscriptsSurfaceGuide } from "./TranscriptsSurfaceGuide";
import { HUB_LIBRARIES_HREF, transcriptsToHubHref } from "@/features/knowledge/hub/legacyRoutes";

export function TranscriptsListPage() {
  // SIDE BY SIDE (Arman, 2026-09-29): the Knowledge hub's Transcripts view is
  // the replacement for this page, and he compares the two before this one is
  // replaced — so this page links to the new view on the SAME search, scope and
  // filters, and the new view links back ("Back to the old page").
  const searchParams = useSearchParams();
  const newViewHref = transcriptsToHubHref(Object.fromEntries(searchParams.entries()));
  const tryNewButton = (
    <Button asChild size="sm" variant="ghost" className="h-11 lg:h-7">
      <Link href={newViewHref} aria-label="Try the new Transcripts view in Knowledge">
        <ArrowRight className="h-4 w-4" />
        <span className="max-sm:sr-only">Try the new Transcripts</span>
      </Link>
    </Button>
  );
  const newButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/transcripts/new" aria-label="New transcript">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New</span>
      </Link>
    </Button>
  );

  // A WHOLE CHANNEL IS NOT FOUR MORE CLICKS OF "New". The four capture
  // surfaces all take one recording at a time; someone who already has
  // transcripts and wants a creator's entire back catalogue has no door here
  // at all. Libraries is that door.
  //
  // It sits in `headerActions`, NOT in TranscriptsSurfaceGuide: the guide
  // renders only inside the empty state, and the person this door is for — the
  // one who already has transcripts — never sees the empty state. A door only
  // the wrong audience can reach is a dead end with extra steps. The header
  // keeps its one-button density on phones (label collapses like "New").
  const wholeChannelButton = (
    <Button asChild size="sm" variant="outline" className="h-11 lg:h-7">
      <Link
        href={HUB_LIBRARIES_HREF}
        aria-label="Catalogue a whole YouTube channel in Libraries"
      >
        <Library className="h-4 w-4" />
        <span className="max-sm:sr-only">Whole channel</span>
      </Link>
    </Button>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {tryNewButton}
      {wholeChannelButton}
      {newButton}
    </div>
  );

  // The empty state is the ONE place the surface wayfinding renders — it never
  // sits above the list, so a user with transcripts sees zero page shift.
  const emptyAction = (
    <>
      {headerActions}
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
        headerActions={headerActions}
        emptyAction={emptyAction}
      />
    </>
  );
}
