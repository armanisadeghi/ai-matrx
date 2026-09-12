"use client";

// useOrganizationRequired — the missing half of the guard-before-the-call
// pattern, in ONE place.
//
// THE TWO STATES EVERY ORG-SCOPED SURFACE CONFUSES
// ------------------------------------------------
// `appContext.organization_id === null` means two completely different things
// at two different moments:
//
//   1. **Boot has not finished.** The selection is still being resolved
//      (stored choice → stated default → personal org → sole membership).
//      Correct behaviour: wait. Firing an org-scoped transport here is the
//      hydration race every workflow-runtime hook documents — refused on every
//      cold load and never retried.
//   2. **Boot finished and there is still nothing.** The person belongs to no
//      organization, or cleared the selection mid-session. Correct behaviour:
//      say so, with the picker. Waiting here is a spinner that never resolves —
//      a screen that lies (law 4), which is exactly what `/workflows/waiting`
//      showed.
//
// Surfaces that guard with a bare `if (!organizationId) return;` get state 1
// right and state 2 wrong: they sit on a skeleton forever. Surfaces that call
// anyway get state 2 "right" (an error) and state 1 wrong. This hook is the
// single reading of both, derived from `selectShouldPromptForOrganization` —
// the same signal the header's own no-organization cue uses, so a screen and
// the chrome around it can never disagree about whether an organization is
// missing.
//
// USAGE
//   const { organizationId, canLoad, organizationRequired } = useOrganizationRequired();
//   useEffect(() => { if (!canLoad) return; void load(); }, [canLoad, organizationId]);
//   if (organizationRequired) return <OrganizationRequiredNotice what="Waiting runs" />;
//   if (loading) return <Skeleton />;

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";

export interface OrganizationRequiredGate {
  /** The explicitly selected organization, or null. */
  organizationId: string | null;
  /** True when an org-scoped transport can be called without being refused. */
  canLoad: boolean;
  /**
   * True ONLY once boot has settled with no selection — the honest, terminal
   * "choose an organization" state. Never true during hydration.
   */
  organizationRequired: boolean;
  /**
   * True while boot is still resolving: neither loadable nor refused yet. Keep
   * showing the skeleton here, and only here.
   */
  resolving: boolean;
}

export function useOrganizationRequired(): OrganizationRequiredGate {
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationRequired = useAppSelector(selectShouldPromptForOrganization);
  const canLoad = organizationId != null;
  return {
    organizationId,
    canLoad,
    organizationRequired,
    resolving: !canLoad && !organizationRequired,
  };
}
