// features/hr/shared/useHrContext.ts
//
// THE EMPLOYER RESOLUTION HOOK. Every `/hr/*` surface stands on this.
//
// 🚨 HR LISTS SPAN EMPLOYERS; HR AGGREGATES AND ACTIONS BELONG TO ONE.
// (Arman, 2026-09-30 — common-docs /policies/access-ladder.md;
// this replaces the older "never filter an HR list to all my orgs" rule.)
//
//   LISTS a person browses (employees, leave requests, relations cases, verifications,
//   any row list) open on **All organizations**: rows from every employer this person
//   can see, the employer as a column, and a VISIBLE `EntityOrgFilter` (`?org_filter=`)
//   to narrow. RLS/the doors already decide what each person sees — nothing here adds
//   or removes an access check.
//
//   AGGREGATES and ACTIONS — headcount totals, pay runs, pay periods, timesheet sums and
//   approval batches, an employer's HR settings — belong to EXACTLY ONE employer. Under
//   All organizations those panels show a one-line prompt to pick an organization (with
//   the picker right there, `HrEmployerPicker`); they never sum two employers together
//   and never silently pick one. When the filter names one employer they work for it.
//
// 🚨 THE EMPLOYER IS NEVER TAKEN FROM THE ACTIVE ORGANIZATION. The active org is where a
// NEW record is saved, nothing more. And HR never uses `?org_filter=` (LinkOrganizationWatcher
// owns that param and SWITCHES the active org); HR's employer filter is `?org_filter=`.
//
// The resolution order:
//   1. `?org_filter=<orgId|slug>` — the one visible filter, and the door format every
//      external link uses. It names one employer.
//   2. if the user's HR-reachable orgs number exactly one → that one, SILENTLY (there is
//      nothing to choose between; All and that one are the same set).
//   3. otherwise → ALL ORGANIZATIONS: `active` is null, list surfaces read every employer
//      in scope (`scope.employers`), and a surface that needs one employer renders
//      `<HrEmployerPicker>` AS THE PAGE (`HrPageState requireEmployer`).
//
// Rule 2 is partly the server's: `hr_my_context(null)` already applies it. This hook adds
// the slug lane (the server takes a uuid only) and re-resolves when the filter's org turns
// out not to be HR-reachable. Under All it also reads each employer's own context once, so
// the nav shows the union of what the person may do and list surfaces can tell which
// employer each row belongs to.
//
// 🚨 TWO LAWS GOVERN THE RE-RESOLVE, AND THEY ARE THE WHOLE POINT OF THIS FILE.
//
//  A. **AN EXPLICIT `?org_filter=` IS THE ANSWER, NOT A SUGGESTION.** Rule 1 resolves FIRST,
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

import { isUuidShape } from "@ai-matrx/kit/uuid";

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
 * `askedRef` is what belongs in a `?org_filter=` to get back to what they asked for —
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

/**
 * WHICH EMPLOYERS A LIST READS. `mode: "all"` is All organizations — every employer
 * this person does HR in (module on and set up); `"one"` is a single employer, named by
 * the filter or the sole employer. A LIST surface reads `scope.employers`; an aggregate
 * or an action reads `active` and renders the picker when it is null.
 */
export type HrScope = {
  mode: "all" | "one";
  /** The employers a list reads, name-sorted. */
  employers: HrEmployer[];
  /** Each in-scope employer's own context (capabilities, employee/employment ids). */
  actives: HrActiveEmployer[];
  /** `?org_filter=` as written (uuid or slug) — null is All organizations. */
  orgFilter: string | null;
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
   * What to put in `?org_filter=` on every link out of here — the slug when the employer
   * has one (a readable, shareable door), otherwise the uuid.
   */
  orgRef: string | null;
  /**
   * Set when the employer that opened is not the one that was asked for. `HrShell`
   * states it on the page — see law B at the top of this file. Never swap in silence.
   */
  substitution: HrEmployerSubstitution | null;
  /** Which employers a list reads — see `HrScope`. */
  scope: HrScope;
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
  scope: { mode: "all", employers: [], actives: [], orgFilter: null },
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

/**
 * What goes in `?org_filter=` on a link out of here. The UUID, never the slug: the
 * organization filter control (`EntityOrgFilter`) speaks uuids, and a slug in the URL
 * would leave it saying "an organization you are not in". Null when nothing is filtered.
 */
function orgRefFor(active: HrActiveEmployer | null): string | null {
  return active ? active.organization_id : null;
}

const PERSONA_RANK: Record<HrPersona, number> = {
  employee: 0,
  manager: 1,
  hr_admin: 2,
};

/** The nav's view of All organizations: the union of what this person may do anywhere. */
function unionOf(actives: HrActiveEmployer[]): {
  persona: HrPersona | null;
  capabilities: string[];
} {
  let persona: HrPersona | null = null;
  const caps = new Set<string>();
  for (const a of actives) {
    if (a.persona && (persona === null || PERSONA_RANK[a.persona] > PERSONA_RANK[persona])) {
      persona = a.persona;
    }
    for (const c of a.capabilities) caps.add(c);
  }
  return { persona, capabilities: [...caps] };
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
  askedEmployer,
  resolved,
}: {
  orgParam: string | null;
  askedEmployer: HrEmployer | null;
  resolved: HrMyContext;
}): HrEmployerSubstitution | null {
  const opened = resolved.active;
  if (!opened) return null;

  // Nothing was named: no `?org_filter=`. The active organization is never an ask, so
  // there is nothing to override (and All organizations has no "opened" employer to swap).
  if (!orgParam) return null;

  const askedId = askedEmployer?.organization_id ?? null;
  if (askedId && askedId === opened.organization_id) return null;

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

  const [context, setContext] = useState<HrMyContext | null>(null);
  const [substitution, setSubstitution] =
    useState<HrEmployerSubstitution | null>(null);
  const [allActives, setAllActives] = useState<HrActiveEmployer[]>([]);
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

      // The filter wins when it is a uuid; a slug needs the employer list to map it, so
      // it takes the second pass below. No filter → null → the server answers with every
      // employer (and `active` only when there is exactly one). The active organization is
      // never asked.
      const firstAsk = orgParam && isUuidShape(orgParam) ? orgParam : null;

      const result = await fetchHrContext(firstAsk);
      if (cancelled) return;

      if (result.ok) {
        let resolved = result.data;

        // The slug lane: `hr_my_context` takes a uuid only, so map the slug against
        // the employer list we just got and ask again for the real one.
        if (orgParam && !isUuidShape(orgParam)) {
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
        // A `?org_filter=` that names nothing here is a ref this person cannot do HR in —
        // we never learn (and never say) whether the organization exists.
        const askedEmployer = orgParam
          ? (resolved.employers.find(
              (e) => e.organization_id === orgParam || e.slug === orgParam,
            ) ?? null)
          : null;

        // 🚨 LAW A — AN EXPLICIT `?org_filter=` IS HONORED, MODULE ON OR OFF. When the URL
        // named an employer we opened, we are DONE: a module-off employer renders the
        // enable-door (SPEC-UI-IA §6 / R-L1 §D), which is the door they came for.
        const urlHonored =
          orgParam !== null &&
          askedEmployer !== null &&
          askedEmployer.organization_id === resolved.active?.organization_id;

        // 🚨 SCOPE TO THE PERSON'S REAL HR EMPLOYER, OR AN ADMIN IS LOCKED OUT.
        // `useHrPersona().can` reads `active.capabilities`, so if `active` is null OR resolved
        // to an org where HR is OFF, every HR control is hidden — the inverse of a leak. This
        // bit a real admin (Priya): her global `activeOrgId` was her own organization
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

        // ── All organizations: read each employer's own context, once. ─────────────
        // Only when no single employer opened. The nav shows the union of what this
        // person may do across the employers in scope, and list surfaces label each row
        // with its employer. This never picks one: `active` stays null.
        let scopeActives: HrActiveEmployer[] = [];
        if (!resolved.active && !orgParam) {
          const inScope = resolved.employers.filter(
            (e) => e.module_enabled && e.is_activated,
          );
          const reads = await Promise.all(
            inScope.map((e) => fetchHrContext(e.organization_id)),
          );
          if (cancelled) return;
          scopeActives = reads.flatMap((r) =>
            r.ok && r.data.active ? [r.data.active] : [],
          );
        }

        setContext(resolved);
        setAllActives(scopeActives);
        // 🚨 LAW B — SAY IT OUT LOUD. Something was asked for (a `?org_filter=`, or the
        // user's own active-organization selection) and a DIFFERENT employer opened.
        // Silence here is the silent-employer-switch defect wearing a helpful hat.
        setSubstitution(
          describeSubstitution({
            orgParam,
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
  }, [enabled, orgParam, reloadToken]);

  if (!enabled) return { ...EMPTY, isLoading: false };

  const employers = context?.employers ?? [];
  const active = context?.active ?? null;
  const union = active ? null : unionOf(allActives);
  const inScope = active
    ? employers.filter((e) => e.organization_id === active.organization_id)
    : employers
        .filter((e) => e.module_enabled && e.is_activated)
        .sort((a, b) => a.name.localeCompare(b.name));

  return {
    employers,
    active,
    persona: active ? active.persona : (union?.persona ?? null),
    capabilities: active ? active.capabilities : (union?.capabilities ?? []),
    scope: {
      mode: active ? "one" : "all",
      employers: inScope,
      actives: active ? [active] : allActives,
      orgFilter: orgParam,
    },
    /*
      🚨 THE EMPLOYER TRAVELS FROM THE FIRST PAINT, NOT FROM HYDRATION.

      `orgRefFor` reads the RESOLVED context, so it is null until `hr_my_context` answers. Every
      `?org_filter=`-carrying link built from this value therefore rendered bare for the first render and
      only grew its employer once the fetch landed — measured on 2026-08-28 as
      `413ms → /hr/tasks`, `801ms → /hr/tasks?org=oak-street-studio`. A click inside
      that window drops the employer exactly as a hardcoded literal would, and lands the user in
      whatever their active-org selection happens to name. A link that is only correct after
      hydration is a race, not a fix.

      `orgParam` is `?org_filter=` read straight off `useSearchParams()` — present synchronously, on the
      very first render, and it is by definition the employer this page was asked for. It is a
      FALLBACK, never an override: the moment the context resolves, `orgRefFor` wins, so a server
      substitution (law B) still corrects the value rather than being papered over. With no `?org_filter=`
      in the URL there is nothing to fall back to and this stays null, which is the honest answer —
      the destination then resolves the employer the same way this page just did.
    */
    orgRef: orgParam ? (orgRefFor(active) ?? orgParam) : null,
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
