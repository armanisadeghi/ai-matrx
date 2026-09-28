"use client";

import { useEffect, useRef } from "react";
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
import { askAsMember } from "@/features/organizations/organizationsIAmIn";
import {
  CUSTOM_FIELDS_VALUE_NAME,
  customFieldsScopeValue,
  registerCustomFieldsDoor,
} from "@/features/surfaces/runtime/custom-field-targets";
import {
  useSurfaceDormant,
  useSurfaceRuntime,
  useSurfaceScopeContribution,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { getManifest } from "@/features/surfaces/manifests/registry";

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
  // A dormant copy (a board tile that is not live) keeps its door registered
  // but out of the page's agent offer.
  const dormant = useSurfaceDormant();
  const liveRef = useRef(!dormant);
  useEffect(() => {
    liveRef.current = !dormant;
  });
  // WHAT THE AGENT SEES: the fields and this record's values, contributed as the
  // `custom_fields` value of the surface this page is on — when that surface
  // declares it (`pickBaseline("custom_fields")`); a surface that does not keeps
  // the targets but no value (an undeclared value is a contract error).
  const runtime = useSurfaceRuntime();
  const declares = Boolean(
    runtime && getManifest(runtime.surfaceName)?.values?.some((v) => v.name === CUSTOM_FIELDS_VALUE_NAME),
  );
  useSurfaceScopeContribution(declares ? runtime!.surfaceName : null, "custom-fields-section", () => ({
    [CUSTOM_FIELDS_VALUE_NAME]: customFieldsScopeValue(),
  }));
  const organizationId = rowOrganizationId ?? null;
  // ONE switch: does this organization keep its data in the record store? Set
  // once, for everybody, on the unified data ramp screen (lane NAV-FIX).
  const campaign = useUnifiedDataCampaign({
    organizationId,
    // Member-only door: a record shared from an organization she is not in is
    // treated as OFF without a request (it was a 403 on every load).
    storeSwitch: (organization) =>
      askAsMember(organization, () => UNIFIED_DATA_CAMPAIGN.enabled(organization), false),
  });
  if (!campaign.on || !organizationId) return null;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource: recordsDataSource(createClient()), actor: personActor(userId), organizationId }}
    >
      {/* THE AGENT TWIN OF "ADD FIELD": the section hands its door to the
          platform write target \`custom_fields_add\`, so every page that embeds
          this line offers it to its agents (surfaces/runtime/custom-field-targets.ts). */}
      <CustomFieldsSection
        entityToken={entityToken}
        recordId={recordId}
        title={title}
        className={className}
        agentDoor={(door) => registerCustomFieldsDoor({ ...door, isLive: () => liveRef.current })}
      />
    </RecordsMount>
  );
}
