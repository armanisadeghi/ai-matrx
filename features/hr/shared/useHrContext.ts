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
//
// 🚨 TWO LAWS GOVERN THE RE-RESOLVE, AND THEY ARE THE WHOLE POINT OF THIS FILE.
//
//  A. **AN EXPLICIT `?org=` IS THE ANSWER, NOT A SUGGESTION.** Rule 1 resolves FIRST,
//     including when that employer has HR switched OFF. The module-off employer is
//     not a dead end that needs rescuing: SPEC-UI-IA §6 and R-L1 §D both rule that
//     `/hr?org=<thatOrg>` renders the ENABLE-DOOR for an owner/admin and a plain
//     not-enabled page for everyone else — which is exactly what `HrPageState` does
//     with `isHrModuleOff`. `hr_my_context` deliberately keeps such an org in
//     `employers` for its owner/admin for that reason. Swapping the user into a
//     DIFFERENT employer here would hide the one door they came for.
//
//  B. **NO EMPLOYER IS EVER SUBSTITUTED IN SILENCE.** The re-resolve below is a real
//     rescue — a multi-employer admin whose global active org is her personal
//     workspace would otherwise land in an empty HR with no way in — but a rescue the
//     user is not told about is indistinguishable from the silent-employer-switch
//     defect this module's URL rules exist to prevent. So whenever the employer that
//     OPENS is not the employer that was ASKED FOR, `substitution` is set, and
//     `HrShell` states it on the page with the way back. Never drop that.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { isUuid } from "@/features/scopes/service/associationGuards";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";

import { HR_ORG_PARAM } from "../constants";
import type { HrPersona } from "../constants";
import { fetchHrContext, validateHrBrowserSession } from "../service";
import type {
  HrActiveEmployer,
  HrDenied,
  HrEmployer,
  HrFailed,
  HrMyContext,
} from "../types";

/**
 * The employer that opened is NOT the employer that was asked for. Set only when
 * that actually happened; `null` is the ordinary case.
 *
 * `askedRef` is what belongs in a `?org=` to get back to what they asked for —
 * null when we could not open it at all and there is nothing honest to link to.
 */
export type HrEmployerSubstitution = {
  /** The employer that was asked for, when we are allowed to name it. */
  askedName: string | null;
  /** A slug or uuid for the asked-for employer, for the way back. */
  askedRef: string | null;
  /**
   * `module-off` — they asked for a real employer of theirs that has HR switched off.
   * `unavailable` — the ref named no employer they can do HR in (worded so it does
   * not disclose whether the organization exists — same law as `HrNoAccess`).
   */
  reason: "module-off" | "unavailable";
  /** The employer actually opened. */
  openedName: string;
};

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
  /**
   * Set when the employer that opened is not the one that was asked for. `HrShell`
   * states it on the page — see law B at the top of this file. Never swap in silence.
   */
  substitution: HrEmployerSubstitution | null;
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
  substitution: null,
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
  const match = employers.find(
    (e) => e.organization_id === active.organization_id,
  );
  return match?.slug?.trim() || active.organization_id;
}

/**
 * Law B's whole implementation: compare what was asked for with what opened, and
 * describe the difference in the words the page will say. Returns null — the
 * ordinary case — whenever the employer that opened IS the one that was asked for,
 * and whenever nothing was asked for at all (SPEC-UI-IA rule 3's silent default for
 * a person with exactly one HR employer stays silent, deliberately: nobody named
 * anything else, so nothing was overridden).
 */
export function describeSubstitution({
  orgParam,
  activeOrgId,
  askedEmployer,
  resolved,
}: {
  orgParam: string | null;
  activeOrgId: string | null;
  askedEmployer: HrEmployer | null;
  resolved: HrMyContext;
}): HrEmployerSubstitution | null {
  const opened = resolved.active;
  if (!opened) return null;

  // Nothing was named: no `?org=`, and no active-organization selection to override.
  if (!orgParam && !activeOrgId) return null;

  const askedId = askedEmployer?.organization_id ?? (orgParam ? null : activeOrgId);
  if (askedId && askedId === opened.organization_id) return null;
  // A `?org=` that resolved to an employer we DID open is handled by the line above;
  // an active-org selection we could not even name (they have left it since) is not
  // something to announce — there is no employer to point at and nothing was lost.
  if (!orgParam && !askedEmployer) return null;

  const openedName =
    resolved.employers.find(
      (e) => e.organization_id === opened.organization_id,
    )?.name ?? "this employer";

  return {
    askedName: askedEmployer?.name ?? null,
    askedRef: askedEmployer
      ? askedEmployer.slug?.trim() || askedEmployer.organization_id
      : null,
    reason:
      askedEmployer && !askedEmployer.module_enabled ? "module-off" : "unavailable",
    openedName,
  };
}

/**
 * Does the actual resolution. `<HrProvider>` is its only intended caller — every
 * other surface reads the result through `useHrContext()`.
 */
export function useHrContextResolver(
  options: { enabled?: boolean } = {},
): HrContextValue {
  const enabled = options.enabled ?? true;
  const searchParams = useSearchParams();
  const orgParam = searchParams?.get(HR_ORG_PARAM)?.trim() || null;
  const { activeOrgId } = useActiveOrganizationPicker();

  const [context, setContext] = useState<HrMyContext | null>(null);
  const [substitution, setSubstitution] =
    useState<HrEmployerSubstitution | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      // The SSR-seeded identity can outlive the browser session for one render.
      // Validate here, before the context RPC that unlocks every other HR read,
      // so an expired session cannot fan out into anonymous 42501 failures.
      const session = await validateHrBrowserSession();
      if (cancelled) return;
      if (!session.ok) {
        setError(session);
        setIsLoading(false);
        return;
      }

      // Rule 1 wins when it is a uuid; a slug needs the employer list to map it, so
      // it takes the second pass below. Rule 2 is the picker's org.
      const firstAsk =
        orgParam && isUuid(orgParam) ? orgParam : (activeOrgId ?? null);

      let result = await fetchHrContext(firstAsk);
      if (cancelled) return;

      if (result.ok) {
        let resolved = result.data;

        // The slug lane: `hr_my_context` takes a uuid only, so map the slug against
        // the employer list we just got and ask again for the real one.
        if (orgParam && !isUuid(orgParam)) {
          const bySlug = resolved.employers.find((e) => e.slug === orgParam);
          if (
            bySlug &&
            bySlug.organization_id !== resolved.active?.organization_id
          ) {
            const second = await fetchHrContext(bySlug.organization_id);
            if (cancelled) return;
            if (second.ok) resolved = second.data;
          }
        }

        // ── Who was asked for, and did they get it? ─────────────────────────
        // The URL's employer, resolved against the list the server just returned.
        // A `?org=` that names nothing here is a ref this person cannot do HR in —
        // we never learn (and never say) whether the organization exists.
        const askedEmployer =
          resolved.employers.find((e) =>
            orgParam
              ? e.organization_id === orgParam || e.slug === orgParam
              : e.organization_id === activeOrgId,
          ) ?? null;

        // 🚨 LAW A — AN EXPLICIT `?org=` IS HONORED, MODULE ON OR OFF. When the URL
        // named an employer we opened, we are DONE: a module-off employer renders the
        // enable-door (SPEC-UI-IA §6 / R-L1 §D), which is the door they came for.
        const urlHonored =
          orgParam !== null &&
          askedEmployer !== null &&
          askedEmployer.organization_id === resolved.active?.organization_id;

        // 🚨 SCOPE TO THE PERSON'S REAL HR EMPLOYER, OR AN ADMIN IS LOCKED OUT.
        // `useHrPersona().can` reads `active.capabilities`, so if `active` is null OR resolved
        // to an org where HR is OFF, every HR control is hidden — the inverse of a leak. This
        // bit a real admin (Priya): her global `activeOrgId` was her personal workspace
        // (module off), so `active` came back with an EMPTY capability set while she holds 21
        // capabilities in her actual workplace. When exactly ONE of her employers has HR on,
        // that is unambiguously her HR context — re-fetch for it. (The server applies the same
        // default when asked with no org; this covers the case where the client asked for the
        // wrong org.) Zero or many HR-enabled employers stays as-is — the picker decides.
        //
        // It runs ONLY when the URL did not already answer the question (law A).
        const activeIsHrReachable = resolved.active?.module_enabled === true;
        if (!urlHonored && !activeIsHrReachable) {
          const hrEmployers = resolved.employers.filter((e) => e.module_enabled);
          const target =
            hrEmployers.length === 1
              ? hrEmployers[0].organization_id
              : !resolved.active && resolved.employers.length === 1
                ? resolved.employers[0].organization_id
                : null;
          if (target && target !== resolved.active?.organization_id) {
            const scoped = await fetchHrContext(target);
            if (cancelled) return;
            if (scoped.ok) resolved = scoped.data;
          }
        }

        setContext(resolved);
        // 🚨 LAW B — SAY IT OUT LOUD. Something was asked for (a `?org=`, or the
        // user's own active-organization selection) and a DIFFERENT employer opened.
        // Silence here is the silent-employer-switch defect wearing a helpful hat.
        setSubstitution(
          describeSubstitution({
            orgParam,
            activeOrgId: activeOrgId ?? null,
            askedEmployer,
            resolved,
          }),
        );
        setError(null);
      } else {
        setError(result);
        setSubstitution(null);
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
    /*
      🚨 THE EMPLOYER TRAVELS FROM THE FIRST PAINT, NOT FROM HYDRATION.

      `orgRefFor` reads the RESOLVED context, so it is null until `hr_my_context` answers. Every
      `?org=`-carrying link built from this value therefore rendered bare for the first render and
      only grew its employer once the fetch landed — measured on 2026-08-28 as
      `413ms → /hr/tasks`, `801ms → /hr/tasks?org=zzz-throwaway-surface-test-org`. A click inside
      that window drops the employer exactly as a hardcoded literal would, and lands the user in
      whatever their active-org selection happens to name. A link that is only correct after
      hydration is a race, not a fix.

      `orgParam` is `?org=` read straight off `useSearchParams()` — present synchronously, on the
      very first render, and it is by definition the employer this page was asked for. It is a
      FALLBACK, never an override: the moment the context resolves, `orgRefFor` wins, so a server
      substitution (law B) still corrects the value rather than being papered over. With no `?org=`
      in the URL there is nothing to fall back to and this stays null, which is the honest answer —
      the destination then resolves the employer the same way this page just did.
    */
    orgRef: orgRefFor(employers, active) ?? orgParam,
    substitution,
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
