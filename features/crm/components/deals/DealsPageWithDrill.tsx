"use client";

// features/crm/components/deals/DealsPageWithDrill.tsx — /crm/deals with its numbers one control away
// (lane DRILL-WAVE3): the server-paged deal list (editing, board, saved views) stays the first screen;
// the declared definition `crm_deals` (aidream apps/shared/records/scripts/drill-definitions/crm_deals.drill.ts)
// counts every deal the member can see — by stage, person, source and expected close month.

import { OrganizationDrillExplorer } from "@/components/official/drill-explorer/OrganizationDrillExplorer";

import { DealsPage } from "./DealsPage";

export function DealsPageWithDrill() {
  return (
    <OrganizationDrillExplorer
      definition="crm_deals"
      title="Deals"
      rootLabel="All deals"
      listLabel="Deals"
      list={<DealsPage />}
      headline={{ measure: "deals", also: ["open", "won", "value"] }}
      rowNoun="deal"
      countMeasure="deals"
      location="CRM › Deals"
      dataAttribute="data-crm-deals-drill"
    />
  );
}
