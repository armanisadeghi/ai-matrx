"use client";

// features/shell/navigation/useShellNavGates.ts
//
// WHICH GATED NAV DESTINATIONS EXIST FOR THIS PERSON RIGHT NOW.
//
// A nav child may carry `gate: <id>` (see `nav-data.ts`). The sidebar resolves
// the switches here, once, and hands the answers to `partitionNavChildren`.
// This is a FILTER over the one nav tree, not a second navigation system: a
// gate that is off removes a child and changes nothing else.
//
// UNANSWERED IS OFF. `useUnifiedDataCampaign` answers `null` until both the
// platform default and this person's own rung have come back; a destination
// that appeared for a moment and then vanished would be worse than one that
// arrives a moment late, so `null` counts as off.
//
// The 19 September verdict's twelfth defect was that nothing in the app linked
// to the unified store's pages at all — "the new address has to be typed". This
// is the other half of fixing that: the entry is in the one nav tree beside
// `/data`, and it appears exactly where the store's campaign switch is on.

import { useEffect, useMemo, useState } from "react";
import type { ShellNavGates } from "@/features/shell/constants/nav-data";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import { UNIFIED_DATA_CAMPAIGN, useUnifiedDataCampaign } from "@/lib/knobs/unifiedDataCampaign";

export function useShellNavGates(): ShellNavGates {
  const userId = useAppSelector(selectUserId);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    // The active organization is a browser-local choice; reading it in an
    // effect keeps this hook safe in a server-rendered shell.
    setOrganizationId(getActiveOrgId());
  }, []);

  const campaign = useUnifiedDataCampaign({
    organizationId,
    userId,
    platformDefault: () => UNIFIED_DATA_CAMPAIGN.enabled(),
  });

  return useMemo<ShellNavGates>(
    () => ({ "unified-data-campaign": campaign.on === true }),
    [campaign.on],
  );
}
