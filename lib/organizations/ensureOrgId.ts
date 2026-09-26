// lib/organizations/ensureOrgId.ts
//
// The ONE funnel through which an org-scoped write gets the organization it
// acts in.
//
// Nothing here PICKS an organization for the person. A "default organization"
// is at most a per-client DISPLAY preference, read by the org picker and
// nothing else (2026-09-19 ruling, Arman). A request that needs an
// organization and has none is HELD, the person is shown their memberships and
// SETS one, and the request then proceeds. Sole-membership auto-select stays,
// because there is nothing to choose.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// `ensureOrgId` ASKS (see its own note); `ensureOrgIdServer` REFUSES with the
// caller's memberships attached.

import type { SupabaseClient } from "@supabase/supabase-js";
import { organizationRequired } from "@/lib/organizations/organizationRequiredServerError";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
// Cycle-free leaf (same constraint as activeOrg.ts) — never `@/lib/redux/store`.
import { getStoreSingleton } from "@/lib/redux/store-singleton";
// The ONE "has the organization question been answered yet?" promise, settled
// by the boot path (activeOrgBootstrap + appContextPolicy.remote.fetch).
import {
  isOrgBootstrapResolved,
  whenOrgBootstrapResolved,
} from "@/lib/organizations/orgBootstrapGate";

/**
 * Resolve the organization an org-scoped write acts in. Resolution order:
 *   1. the explicitly-passed `orgId` (a callsite that already knows the
 *      organization — a durable record's own org, for instance);
 *   2. the organization the user SELECTED (`getActiveOrgId`, i.e. Redux
 *      `appContext.organization_id`), after joining the store's bootstrap
 *      hydration so a write racing boot is not mistaken for a missing one;
 *   3. on a COLD boot, where neither of those can have an answer yet, wait for
 *      the boot path's own remote resolution (`orgBootstrapGate`) and read the
 *      selection again — refusing before anyone has looked is a false refusal;
 *   4. ASK. The write is HELD, the person is shown their memberships, they SET
 *      one, and this returns it — the write then proceeds normally, stamped
 *      exactly where it would have been stamped had they chosen first.
 *
 * 🚨 RUNG 4 IS THE 2026-09-19 RULING (Arman), AND IT IS THE WHOLE POINT.
 * Before it, this function did one of two useless things: until 2026-09-17 it
 * ended in a server-side fallback organization (a SUBSTITUTION — the person's
 * work filed in a workspace they never chose, silently), and after that it
 * simply THREW. Both answer a question only the person can answer. Throwing is the honest half of
 * the answer and still leaves ~210 files telling a person to go do something
 * else, somewhere else, and come back — which is how a refused autosave
 * becomes a lost draft.
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * So the third option — ask, then continue — is applied HERE, at the ONE
 * funnel all those callsites already pass through, rather than being wired
 * into each of them. Nothing about a callsite changes: it still awaits an
 * organization id and still gets one, or still sees a throw.
 *
 * WHAT STILL THROWS, AND WHY IT MUST:
 *   • `OrganizationSelectionCancelled` — the person closed the picker. That is
 *     an ANSWER, not a failure: "not now". Callers treat it as nothing
 *     happened — no toast, no error banner, no cleared composer. ~50 sites
 *     already recognise it.
 *   • `OrganizationContextError` — we could not ask AT ALL (no browser, no
 *     store, no picker mounted: a server render, a worker, a test). The
 *     fail-closed behaviour is never weakened here, only deferred when there
 *     is a person present to defer to.
 *
 * The gate is imported dynamically on purpose. This module is a cycle-free
 * leaf that service code imports freely; the gate pulls in the Redux root
 * state type and the transport kernel. The import only ever runs on the rung
 * that has already decided to ask, so the ordinary path costs nothing.
 *
 * Law: common-docs/policies/context-is-carried-never-rebuilt.md.
 */
export async function ensureOrgId(
  orgId: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  let activeOrgId = getActiveOrgId();
  if (activeOrgId) return activeOrgId;

  // Descendant passive effects can write in the same commit that starts
  // SyncBootstrap. Join its store-owned warm-cache hydration before treating
  // missing organization context as missing.
  const store = getStoreSingleton() as
    | (ReturnType<typeof getStoreSingleton> & {
        _sync?: { boot: () => Promise<void> };
      })
    | null;
  await store?._sync?.boot();
  activeOrgId = getActiveOrgId();
  if (activeOrgId) return activeOrgId;

  // 🚨 "NOBODY HAS LOOKED YET" IS NOT "THERE IS NONE". The warm-cache boot
  // above answers a RETURNING session, where the last organization comes back
  // out of IndexedDB. On a FIRST-EVER session there is no local record, so the
  // only answer comes from `appContextPolicy.remote.fetch` →
  // `resolveActiveOrgContext`, which deliberately waits for `whenPageIdle`
  // before spending the network. Every write made in that window — an
  // autosave, a first note, a canvas score — was refused with "Select an
  // organization" although the person HAS one and the app was seconds from
  // finding it (13 memberships, 24 seconds, 2026-09-18). A false refusal is as
  // dishonest as a false success, and PROMPTING while still resolving is the
  // same lie wearing a dialog. So join the answer the boot path is already
  // fetching BEFORE asking anyone anything. This starts nothing: it waits on
  // the one promise the boot settles (bounded, so it can never hang).
  if (!isOrgBootstrapResolved()) {
    await whenOrgBootstrapResolved();
    activeOrgId = getActiveOrgId();
    if (activeOrgId) return activeOrgId;
  }

  // Boot has looked and there is genuinely no selection. ASK.
  const { ensureOrganizationContext } = await import(
    "@/lib/organization/organization-gate"
  );
  return ensureOrganizationContext();
}

/**
 * The organization a ROUTE HANDLER or Server Action acts in.
 *
 * 🚨 IT RESOLVES NOTHING (2026-09-19 ruling). The server never substitutes an
 * organization for a choice nobody made. There is one rule: return the organization the REQUEST NAMED, or refuse
 * with `OrganizationRequiredServerError`, which carries the caller's own
 * memberships so the client can hold the request, show the picker, let the
 * person SET one, and retry. The handler answers it with
 * `organizationRequiredResponse(error)` — a 400 whose body matches, field for
 * field, what the Python server's `organization_for_request` emits
 * (`aidream/services/organizations/request_scope.py`), so one client
 * recogniser covers a refusal from either server.
 *
 * It keeps the two-argument shape so no callsite has to be rewritten to be
 * made honest: pass the admitted organization and it is returned unchanged.
 */
export async function ensureOrgIdServer(
  client: SupabaseClient,
  orgId: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  return organizationRequired(
    client,
    "This request carried an identity but no organization. Name the " +
      "organization you are acting in and send it again.",
  );
}
