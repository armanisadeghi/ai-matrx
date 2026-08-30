"use client";

// features/agents/mandates/browse/MandatesBrowsePage.tsx
//
// /agents/mandates — the mandates registry on the canonical entity-list shell
// (2026-08-26 rework). Everything mandate-specific lives in ./listConfig.tsx;
// this file is the config plus this page's slots. No prose header — the page
// title bar (PageHeader) carries the identity, the list carries the work.
//
// 🚨 BROWSE + THEIR OWN OVERRIDE, nothing more (Arman, 2026-08-29). Declaring
// a mandate is a platform decision, not a user one, so creation moved to
// /administration/agents/mandates/new and this page has no New button.

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
