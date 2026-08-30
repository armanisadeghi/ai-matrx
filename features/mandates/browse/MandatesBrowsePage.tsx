"use client";

// features/mandates/browse/MandatesBrowsePage.tsx
//
// /agents/mandates — the mandates registry on the canonical entity-list shell
// (2026-08-26 rework). Everything mandate-specific lives in ./listConfig.tsx;
// this file is the config plus this page's slots. No prose header — the page
// title bar (PageHeader) carries the identity, the list carries the work.
//
// 🚨 BROWSE + THEIR OWN OVERRIDE, nothing more (Arman, 2026-08-29). Declaring
// a mandate is a platform decision, not a user one, so creation moved to
// /administration/mandates/new and this page has no New button.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MandatesHeader } from "@/features/mandates/components/MandatesHeader";
import { mandateListConfig } from "./listConfig";
import { MandateCoverageProvider } from "./CoverageBadge";
import { MandateCoverageNotice, useCoverageList } from "./useCoverageList";
import { MINE_SCOPE } from "./service";

export function MandatesBrowsePage() {
  // The WHOLE registry's coverage — this page is every caller's view of every
  // platform mandate, so the report is unscoped.
  const { view, service } = useCoverageList({ scope: MINE_SCOPE });

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <MandateCoverageProvider value={view}>
        <EntityListPage
          config={{ ...mandateListConfig, service }}
          notice={(list) => <MandateCoverageNotice list={list} />}
        />
      </MandateCoverageProvider>
    </>
  );
}
