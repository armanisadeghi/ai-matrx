"use client";

// features/agents/mandates/browse/MandatesBrowsePage.tsx
//
// /agents/mandates — the mandates registry on the canonical entity-list shell
// (2026-08-26 rework). Everything mandate-specific lives in ./listConfig.tsx;
// this file is the config plus this page's slots. No prose header — the page
// title bar (PageHeader) carries the identity, the list carries the work.

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MandatesHeader } from "@/features/agents/mandates/components/MandatesHeader";
import { mandateListConfig } from "./listConfig";

export function MandatesBrowsePage() {
  // A mandate is born the moment the job is known — before any agent exists.
  const newButton = (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href="/agents/mandates/new" aria-label="New mandate">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New Mandate</span>
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <EntityListPage
        config={mandateListConfig}
        headerActions={newButton}
        emptyAction={newButton}
      />
    </>
  );
}
