// lib/redux/thunks/activeOrgBootstrap.ts
//
// Active-organization bootstrap + the single sanctioned UI write path for
// switching the active org. This is the front line of the org-enforcement
// rollout (CLAUDE.md "enforcing organization_id"): every user always has a
// valid org riding along on API calls, even before they explicitly pick one.
//
// Two pieces:
//   1. bootstrapActiveOrganization() — run once at shell hydration by the
//      ActiveOrgBootstrap island (features/shell/components/ActiveOrgBootstrap).
//      Loads the user's orgs, records their PERSONAL org id (the soft-
//      enforcement API fallback), then resolves the active org with this
//      precedence:
//        a. the user's DEFAULT org preference (cross-device, durable) — if they
//           are still a member;
//        b. otherwise, if they belong to exactly ONE org, that org (silent —
//           there is nothing to choose, so no nudge);
//        c. otherwise leave organization_id null on purpose — the signal the
//           UI uses to nudge the user (red avatar ring + drop-down reminder)
//           to pick one and optionally set it as their default.
//      Either way it marks the bootstrap RESOLVED so the "no org" cues stop
//      suppressing themselves (selectShouldPromptForOrganization).
//   2. chooseActiveOrganization({id,name}) — the compliant wrapper UI surfaces
//      call to switch orgs.
//
// The default org is the SINGLE durable source of truth for "which org am I in"
// — there is no separate localStorage "last org" mechanism. The default is read
// straight from the `user_preferences` row at startup (authoritative — no race
// with the client-side preferences sync hydration); want to be restored to an
// org next session? Set it as your default (one switch in the picker).
//
// Why the eslint-disable below: setOrganization is an appContextSlice WRITE
// action, gated to Surface-A active-context components (eslint.config.mjs
// `appContextWriteSyntaxRestrictions`). This module is a legitimate Surface-A
// writer that lives outside active-context/** — the same sanctioned exception
// the canonical useHierarchyReduxBridge and the logout-reset watcher use.
// Setting the global active org IS the job here.

// eslint-disable-next-line no-restricted-syntax -- Surface A: canonical active-org bootstrap + switcher
import {
  setOrganization,
  setPersonalOrganization,
  setOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { getUserOrganizations } from "@/features/organizations/service";
import { getUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { resolvePersonalOrgId, primePersonalOrgId } from "@/lib/organizations/personalOrg";
import type { AppDispatch, RootState } from "@/lib/redux/store";

/**
 * Read the user's default-org preference straight from `user_preferences`.
 * Authoritative + race-free: it does not depend on the client-side preferences
 * sync engine having hydrated yet. Never throws — returns null on any failure
 * (no default → the nudge path).
 */
async function readDefaultOrgIdFromDb(): Promise<string | null> {
  try {
    const userId = getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const prefs = data.preferences as {
      organization?: { defaultOrganizationId?: string | null };
    } | null;
    return prefs?.organization?.defaultOrganizationId ?? null;
  } catch {
    return null;
  }
}

/**
 * Hydrate active-org state. Records the personal org id (API fallback) and
 * auto-selects the user's default org (or their only org). Safe to call once
 * per session after auth resolves. Never throws — a failure still marks the
 * bootstrap resolved so the UI doesn't hang on suppressed cues.
 */
export const bootstrapActiveOrganization =
  () => async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      // Authoritative personal org id straight from the DB (auto-provisioned at
      // signup, never changes). This is the canonical source — it also primes
      // the session-wide `personalOrg` cache so service callsites resolving a
      // null org afterward make zero extra RPC calls. Falls back to the org-list
      // heuristic only if the RPC is unavailable.
      let personalOrgId: string | null = null;
      try {
        personalOrgId = await resolvePersonalOrgId();
      } catch (e) {
        console.warn("[activeOrgBootstrap] current_personal_org_id() failed; falling back to org-list heuristic", e);
      }

      const orgs = await getUserOrganizations();
      if (!orgs || orgs.length === 0) {
        if (personalOrgId) dispatch(setPersonalOrganization(personalOrgId));
        return;
      }

      // Prefer the authoritative id; fall back to the personal-flag org, then
      // the first org if the flag is ever missing.
      const resolvedPersonalId =
        personalOrgId ?? (orgs.find((o) => o.isPersonal) ?? orgs[0])?.id ?? null;
      primePersonalOrgId(resolvedPersonalId);
      dispatch(setPersonalOrganization(resolvedPersonalId));

      // Respect an org that is already actively selected (e.g. a deep-link or a
      // restored full context beat us here).
      if (getState().appContext.organization_id) return;

      // a. Default org preference (durable, cross-device, read authoritatively
      //    from the DB).
      const preferredOrgId = await readDefaultOrgIdFromDb();
      if (preferredOrgId) {
        const match = orgs.find((o) => o.id === preferredOrgId);
        if (match) {
          dispatch(setOrganization({ id: match.id, name: match.name }));
          return;
        }
        // Default points at an org the user is no longer a member of — clear
        // the stale preference so it stops being retried, then fall through.
        dispatch(
          setPreference({
            module: "organization",
            preference: "defaultOrganizationId",
            value: null,
          }),
        );
      }

      // b. Exactly one org → auto-select it. There is nothing to choose, so
      //    suppressing the nudge here is correct, not a shortcut.
      if (orgs.length === 1) {
        const only = orgs[0];
        dispatch(setOrganization({ id: only.id, name: only.name }));
        return;
      }

      // c. Multiple orgs, no default: leave organization_id null on purpose so
      //    the UI nudges the user to choose one (personal org still rides along
      //    on API calls via selectEffectiveOrganizationId).
    } catch (err) {
      console.error("[activeOrgBootstrap] failed to hydrate active org", err);
    } finally {
      // Resolved either way — the UI gates its "no org" cues on this so they
      // never flash before we know the user genuinely has no org.
      dispatch(setOrgBootstrapResolved(true));
    }
  };

/**
 * Switch the active organization from a UI surface. Just dispatches — the
 * active org is the global working context; durable cross-session restore is
 * the job of the default-org preference, not this switcher.
 */
export const chooseActiveOrganization =
  (org: { id: string | null; name?: string | null }) =>
  (dispatch: AppDispatch) => {
    dispatch(setOrganization({ id: org.id, name: org.name ?? null }));
  };
