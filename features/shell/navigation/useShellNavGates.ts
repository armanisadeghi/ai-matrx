"use client";

// features/shell/navigation/useShellNavGates.ts
//
// WHICH GATED NAV DESTINATIONS EXIST FOR THIS PERSON RIGHT NOW.
//
// A nav child may carry `gate: <id>` (see `nav-data.ts`). The sidebar resolves
// the switches here and hands the answers to `partitionNavChildren`. This is a
// FILTER over the one nav tree, not a second navigation system: a gate that is
// off removes a child and changes nothing else.
//
// UNANSWERED IS OFF. `useUnifiedDataCampaign` answers `null` until the switch
// has come back; a destination that appeared for a moment and then vanished
// would be worse than one that arrives a moment late, so `null` counts as off.
//
// THE DEFECT THIS FILE CARRIED, AND THE ONE LINE THAT WAS IT (independent
// verdict, fifth pass, 19 September): "With the store on and the code switch
// on, in the right organization, after a full reload, the Data menu still shows
// only Tables, Workbooks, Pick Lists and the two window entries … the sidebar
// reads the active organization once when it mounts — before the organization
// has loaded — and never looks again, so it always falls back to the platform
// default of off."
//
// That was exactly right. This hook called `getActiveOrgId()` — a SYNCHRONOUS
// read of the Redux store — inside a `useEffect(…, [])`, which runs once, on
// mount, while organization bootstrap is still in flight. It answered `null`
// then and nothing ever asked again. So the gate resolved for "no organization"
// on every single page load, for everybody, for ever.
//
// It now SUBSCRIBES: `useAppSelector(selectOrganizationId)` re-renders this hook
// the moment the organization resolves or the person switches, and the gate is
// asked again for the organization actually on screen. There is no snapshot and
// no mount effect left to be early.

import { useMemo } from "react";
import type { ShellNavGates } from "@/features/shell/constants/nav-data";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

export function useShellNavGates(): ShellNavGates {
  // THE ORGANIZATION ON SCREEN, subscribed — never a one-shot read. A member of
  // an organization whose record store is on sees Records; everybody else does
  // not, and there is no per-person rung on it any more (lane NAV-FIX).
  const organizationId = useAppSelector(selectOrganizationId);

  const campaign = useUnifiedDataCampaign({
    organizationId,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });

  return useMemo<ShellNavGates>(
    () => ({ "unified-data-campaign": campaign.on === true }),
    [campaign.on],
  );
}
