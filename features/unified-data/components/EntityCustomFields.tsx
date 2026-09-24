"use client";

// features/unified-data/components/EntityCustomFields.tsx
//
// THE ONE LINE A STANDARD ENTITY PAGE ADDS (SCR-12 / REC-40 / REC-34).
//
//   <EntityCustomFields entityToken="crm_deal" recordId={deal.id} organizationId={deal.organization_id} />
//
// 🚨 THE ORGANIZATION IS THE ROW'S, NEVER THE PERSON'S (lane ACCESS-IS-PERSONAL, owner's law
// 2026-09-23: "for any RECORD I try to see, the active org is meaningless"). This read the
// organization the person was working in, so a deal of Rincon opened from another of her
// organizations showed that OTHER organization's custom fields — or none. The page already
// holds the row, and the row holds its organization; it hands it in.
//
// That is the whole contract, and it is the same line on all 643 tables the
// registry types Entity or Detail. There is no per-entity code here, on the
// page, or in `@ai-matrx/records-ui`: which fields extend `crm_deal`, what they
// hold, who may add one, and "render nothing when this organization has added
// none" are all the store's answers, asked through the token.
//
// WHY THIS WRAPPER EXISTS AT ALL, AND WHEN IT GOES AWAY. The packages plan
// allows exactly ONE line per standard entity page, and a page that had to mount
// the provider pair itself would be twenty. So the provider pair and the
// organization's own store switch live here, once, and every page adds the one
// line. When the campaign is on platform-wide this file collapses to a re-export
// of `<CustomFieldsSection />`.
//
// It was extracted from `PartyRecordPage`'s private `PartyUnifiedCustomFields`,
// which was the same twenty lines: the second page to want them would have
// copied them, and the third would have copied them differently.

import { CustomFieldsSection, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

export interface EntityCustomFieldsProps {
  /** The standard table's registry token (REC-33) — `party`, `crm_deal`, `crm_interaction`. */
  entityToken: string;
  /** The id of the row this page is showing. */
  recordId: string;
  /** The ROW'S organization (`row.organization_id`). Nothing renders until it is known. */
  organizationId: string | null | undefined;
  /** The heading. Defaults to the section's own. */
  title?: string;
  className?: string;
}

export function EntityCustomFields({
  entityToken,
  recordId,
  organizationId: rowOrganizationId,
  title,
  className,
}: EntityCustomFieldsProps) {
  const userId = useAppSelector(selectUserId);
  const organizationId = rowOrganizationId ?? null;
  // ONE switch: does this organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen (lane NAV-FIX).
  const campaign = useUnifiedDataCampaign({
    organizationId,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });
  if (!campaign.on || !organizationId) return null;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource: recordsDataSource(createClient()), actor: personActor(userId), organizationId }}
    >
      <CustomFieldsSection entityToken={entityToken} recordId={recordId} title={title} className={className} />
    </RecordsMount>
  );
}
