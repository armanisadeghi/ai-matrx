// features/hr/shared/useHrContext.ts
//
// THE EMPLOYER RESOLUTION HOOK. Every `/hr/*` surface stands on this.
//
// 🚨 HR IS STRICTLY SINGLE-EMPLOYER. An `hr.employee` belongs to exactly ONE
// employer of record, and merging two employers' headcount, timesheets or pay data
// into one view is a compliance defect, not a feature. There is no cross-employer
// HR view, in v1 or later. Never filter an HR list to "all my orgs" — the CRM's
// multi-org scope tabs are the wrong model here and copying them is a bug.
//
// The resolution order is SPEC-UI-IA §1, exactly:
//   1. `?org=<orgId|slug>` — the door format every external link uses.
//   2. the user's active-organization selection (`useActiveOrganizationPicker`).
//   3. if the user's HR-reachable orgs number exactly one → that one, SILENTLY.
//   4. otherwise → the employer picker AS THE PAGE (`<HrEmployerPicker>`), never a
//      modal and never a blocked shell. A chooser is a legitimate page state.
//
// Rules 3 and 4 are partly the server's: `hr_my_context(null)` already applies rule
// 3. This hook adds the slug lane (the server takes a uuid only) and re-resolves
// when the picker's org turns out not to be HR-reachable.

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { isUuid } from "@/features/scopes/service/associationGuards";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";

import { HR_ORG_PARAM } from "../constants";
import type { HrPersona } from "../constants";
import { fetchHrContext } from "../service";
import type {
  HrActiveEmployer,
  HrDenied,
  HrEmployer,
  HrFailed,
  HrMyContext,
} from "../types";

export type HrContextValue = {
  /** Every employer this person can do HR in — including one whose module is OFF, when they can turn it on. */
  employers: HrEmployer[];
  /** The resolved employer, or null → render `<HrEmployerPicker>` AS THE PAGE. */
  active: HrActiveEmployer | null;
  /** null until an employer resolves. Nav shows nothing persona-specific before that. */
  persona: HrPersona | null;
  /** The raw capability list for the active employer. Use `useHrPersona().can(…)`. */
  capabilities: string[];
  /**
   * What to put in `?org=` on every link out of here — the slug when the employer
   * has one (a readable, shareable door), otherwise the uuid.
   */
  orgRef: string | null;
  /** True on the FIRST resolve only. A refresh keeps the last context on screen. */
  isLoading: boolean;
  error: HrDenied | HrFailed | null;
  refresh: () => void;
  asOf: string | null;
};

const EMPTY: HrContextValue = {
  employers: [],
  active: null,
  persona: null,
  capabilities: [],
  orgRef: null,
  isLoading: true,
  error: null,
  refresh: () => {},
  asOf: null,
};

/**
 * Set by `<HrProvider>` in the `/hr` layout so the shell, the nav, the page and
 * every panel share ONE resolution instead of each firing `hr_my_context`.
 */
export const HrRuntimeContext = createContext<HrContextValue | null>(null);

function orgRefFor(
  employers: HrEmployer[],
  active: HrActiveEmployer | null,
): string | null {
  if (!active) return null;
  const match = employers.find((e) => e.organization_id === active.organization_id);
  return match?.slug?.trim() || active.organization_id;
}

/**
 * Does the actual resolution. `<HrProvider>` is its only intended caller — every
 * other surface reads the result through `useHrContext()`.
 */
export function useHrContextResolver(options: { enabled?: boolean } = {}): HrContextValue {
  const enabled = options.enabled ?? true;
  const searchParams = useSearchParams();
  const orgParam = searchParams?.get(HR_ORG_PARAM)?.trim() || null;
  const { activeOrgId } = useActiveOrganizationPicker();

  const [context, setContext] = useState<HrMyContext | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      // Rule 1 wins when it is a uuid; a slug needs the employer list to map it, so
      // it takes the second pass below. Rule 2 is the picker's org.
      const firstAsk = orgParam && isUuid(orgParam) ? orgParam : activeOrgId ?? null;

      let result = await fetchHrContext(firstAsk);
      if (cancelled) return;

      if (result.ok) {
        let resolved = result.data;

        // The slug lane: `hr_my_context` takes a uuid only, so map the slug against
        // the employer list we just got and ask again for the real one.
        if (orgParam && !isUuid(orgParam)) {
          const bySlug = resolved.employers.find((e) => e.slug === orgParam);
          if (bySlug && bySlug.organization_id !== resolved.active?.organization_id) {
            const second = await fetchHrContext(bySlug.organization_id);
            if (cancelled) return;
            if (second.ok) resolved = second.data;
          }
        }

        // Rule 3, for the case the server could not apply it: we asked for an org
        // that is not HR-reachable (the picker's org), so the server returned no
        // active employer even though exactly one exists.
        if (!resolved.active && resolved.employers.length === 1) {
          const only = resolved.employers[0];
          const third = await fetchHrContext(only.organization_id);
          if (cancelled) return;
          if (third.ok) resolved = third.data;
        }

        setContext(resolved);
        setError(null);
      } else {
        setError(result);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, orgParam, activeOrgId, reloadToken]);

  if (!enabled) return { ...EMPTY, isLoading: false };

  const employers = context?.employers ?? [];
  const active = context?.active ?? null;

  return {
    employers,
    active,
    persona: active?.persona ?? null,
    capabilities: active?.capabilities ?? [],
    orgRef: orgRefFor(employers, active),
    isLoading,
    error,
    refresh,
    asOf: context?.as_of ?? null,
  };
}

/**
 * Read the resolved employer context. Inside `/hr/*` this is always the provider's
 * single resolution; outside it (an entry-point door on a CRM or org page) the hook
 * resolves on its own so those surfaces do not need to mount the HR shell.
 */
export function useHrContext(): HrContextValue {
  const provided = useContext(HrRuntimeContext);
  // Always called, never conditionally — the resolver simply does no work when a
  // provider already answered.
  const standalone = useHrContextResolver({ enabled: provided === null });
  return provided ?? standalone;
}

/** True when this org has HR switched off — the nav item is ABSENT, not disabled. */
export function isHrModuleOff(context: HrContextValue): boolean {
  return context.active !== null && context.active.module_enabled === false;
}

/** True when HR is on but nobody has run §2.4's activation wizard yet. */
export function needsHrActivation(context: HrContextValue): boolean {
  return (
    context.active !== null &&
    context.active.module_enabled === true &&
    context.active.is_activated === false
  );
}
