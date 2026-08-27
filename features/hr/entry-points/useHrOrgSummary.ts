// features/hr/entry-points/useHrOrgSummary.ts
//
// The ONE read behind every §6 entry point that lives OUTSIDE `/hr`.
//
// 🚨 MODULE-OFF IS **ABSENT**, NOT DISABLED — AND THAT INCLUDES THESE DOORS.
// The sensitivity rule applies to modules too (SPEC-UI-IA §6): with
// `hr.module.enabled = false` an HR door on an org page, a members row or a CRM
// record renders NOTHING rather than a link into a module that is off. The one
// exception is the org owner/admin, who is the only person who can turn it on
// and therefore gets the enable door instead of silence.
//
// 🚨 THESE SURFACES DO NOT MOUNT THE HR SHELL. They are org and CRM pages, so
// they cannot rely on `HrProvider`'s single resolution — `useHrContext()`
// falls back to its own resolver outside `/hr`, which is exactly what it was
// built for. Do not mount `HrProvider` on a foreign page to "fix" that.

"use client";

import { useEffect, useState } from "react";

import { fetchHrOrgSummary } from "@/features/hr/service";

export type HrOrgSummary = {
  organization_id: string;
  module_enabled: boolean;
  is_activated: boolean;
  headcount: number;
  prehire_count: number;
  pending_approvals: number;
  can_enable: boolean;
};

export type HrOrgSummaryState = {
  summary: HrOrgSummary | null;
  isLoading: boolean;
  /**
   * True when this viewer has no answer at all — no HR standing, the module is
   * off for them, or the door is not live yet. EVERY consumer treats this as
   * "render nothing", which is also the correct behaviour before the RPC ships.
   */
  absent: boolean;
};

export function useHrOrgSummary(
  organizationId: string | null,
): HrOrgSummaryState {
  const [summary, setSummary] = useState<HrOrgSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrOrgSummary(organizationId);
      if (cancelled) return;
      // A refusal — or a door that does not exist yet — resolves to ABSENT.
      // Never a broken link, never a card that says HR is unavailable.
      setSummary(result.ok ? (result.data as HrOrgSummary) : null);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { summary, isLoading, absent: !isLoading && summary === null };
}
