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

import { useEffect, useMemo, useState } from "react";
import type { ShellNavGates } from "@/features/shell/constants/nav-data";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export function useShellNavGates(): ShellNavGates {
  // A DOOR IS OPEN IF ANY OF THE PERSON'S ORGANIZATIONS HAS IT (active-org law,
  // rule 1: the active organization never decides what a person sees). The
  // record-store switch is one organization's decision, so the Records entry
  // shows when ANY organization the person belongs to has it on — never only
  // the one selected in the header. Answers are shared per organization
  // (`UNIFIED_DATA_CAMPAIGN.enabled` caches on/off), so this is one cheap ask
  // per membership. Subscribed, never a one-shot read.
  const memberships = useAppSelector(selectOrganizationsList);
  const idsKey = memberships.map((o) => o.id).join(",");
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (idsKey === "") {
      setOn(false);
      return undefined;
    }
    let cancelled = false;
    void Promise.all(
      idsKey
        .split(",")
        .map((id) => UNIFIED_DATA_CAMPAIGN.enabled(id).catch(() => false)),
    ).then((answers) => {
      if (!cancelled) setOn(answers.some(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return useMemo<ShellNavGates>(
    () => ({ "unified-data-campaign": on }),
    [on],
  );
}
