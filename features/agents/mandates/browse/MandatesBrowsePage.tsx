"use client";

// features/agents/mandates/browse/MandatesBrowsePage.tsx
//
// /agents/mandates — the mandates registry on the canonical entity-list shell
// (2026-08-26 rework). Everything mandate-specific lives in ./listConfig.tsx;
// this file is the config plus this page's slots. No prose header — the page
// title bar (PageHeader) carries the identity, the list carries the work.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MandatesHeader } from "@/features/agents/mandates/components/MandatesHeader";
import { mandateListConfig } from "./listConfig";

export function MandatesBrowsePage() {
  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <EntityListPage config={mandateListConfig} />
    </>
  );
}
