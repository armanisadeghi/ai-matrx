// lib/organizations/personalOrg.ts
//
// The ONE canonical way to resolve the signed-in user's PERSONAL organization
// id on the client — the identity of the person's OWN workspace — and the ONE
// funnel through which an org-scoped write gets the organization it acts in.
//
// 🚨 THE PERSONAL ORG IS NOT A FALLBACK, AND NEITHER IS ANYTHING ELSE.
// Until 2026-09-17 `ensureOrgId` ended in the personal-org RPC, so a write the
// person made with nothing selected was filed in their personal workspace
// silently. That was deleted and `ensureOrgId` began to THROW — honest, and
// still a dead end for the ~210 files that funnel through it.
//
// The 2026-09-19 ruling (Arman) settles it for the whole platform: a "default
// organization" is at most a per-client DISPLAY preference, read by the org
// picker and nothing else. No data read, write, API route, server action,
// transport or boot ladder may PICK an organization for the user — not from a
// cookie, not from a saved preference, not from the personal org. A request
// that needs an organization and has none is HELD, the person is shown their
// memberships and SETS one, and the request then proceeds normally.
// Sole-membership auto-select stays, because there is nothing to choose.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// So `ensureOrgId` now ASKS (see its own note), `ensureOrgIdServer` REFUSES
// with the caller's memberships attached, and what remains of the
// personal-org resolver answers one question only: "which organization is this
// user's own workspace?" — for a surface that deliberately, BY NAME, files
// something personal (a creator's payout account, a cross-organization
// notification default).
//
// Backed by the `current_personal_org_id()` RPC (SECURITY DEFINER, no args —
// resolves `auth.uid()` server-side). Every user's personal org is
// auto-provisioned at signup and its id never changes, so this is fetched at
// most ONCE per session and memoized at module scope.
//
// Lifetime: the cache is module-scoped, so it lives for the tab's page
// lifetime. Sign-out does a full `window.location.href` navigation (see
// SignOutMenuItem), which tears down all JS state — so the cache is
// automatically dropped between users. `clearPersonalOrgIdCache()` exists for
// tests and any future in-place auth swap.
//
// `lib/scheduler-client/claim.ts` was once listed here as an exception that
// "still needs the parameterized RPC" for an arbitrary task owner. It does
// not, and has not for some time: it reads the persisted task's OWN
// `organization_id` and refuses to claim a task without one
// (`claim.ts:90-96`). That is the shape the 2026-09-19 ruling asks for --
// carry the organization, never re-derive it -- so there is no exception
// left to name. Verified 2026-09-19 in review.

import { supabase } from "@/utils/supabase/client";
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

let cachedId: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * Seed the cache with a known personal org id (e.g. from the active-org
 * bootstrap, which already fetched it). No-op for a null/empty id.
 */
export function primePersonalOrgId(id: string | null | undefined): void {
  if (id) cachedId = id;
}

/** Synchronous peek at the cached personal org id, or null if not yet loaded. */
export function peekPersonalOrgId(): string | null {
  return cachedId;
}

/** Drop the cached personal org id. For tests / in-place auth swaps only. */
export function clearPersonalOrgIdCache(): void {
  cachedId = null;
  inflight = null;
}

/**
 * The signed-in user's personal organization id. Cached for the session;
 * makes at most one `current_personal_org_id()` RPC call. Throws loudly if the
 * user has no personal org (should be impossible — auto-provisioned at signup —
 * so it surfaces a real defect rather than letting a null org slip into a write).
 */
export async function resolvePersonalOrgId(): Promise<string> {
  if (cachedId) return cachedId;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase.rpc("current_personal_org_id");
    if (error || !data) {
      throw (
        error ??
        new Error(
          "current_personal_org_id() returned no personal organization for the signed-in user",
        )
      );
    }
    cachedId = data as string;
    return cachedId;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

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
 * ended in the personal-org RPC (a SUBSTITUTION — the person's work filed in a
 * workspace they never chose, silently), and after that it simply THREW. Both
 * answer a question only the person can answer. Throwing is the honest half of
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
 * 🚨 IT RESOLVES NOTHING ANY MORE (2026-09-19 ruling). Until today this ended
 * in `current_personal_org_id()`: five route handlers called it with no
 * organization and the SERVER quietly filed the write in the caller's personal
 * workspace — the forbidden substitution, on the one side of the wire the
 * client cannot see. `app/api/user/profile`, `app/api/user/email-preferences`,
 * `app/api/sms/preferences`, `app/api/sms/verify` and
 * `app/api/cms/access-context` all did exactly that.
 *
 * Now there is one rule: return the organization the REQUEST NAMED, or refuse
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

// ---------------------------------------------------------------------------
// GONE: `resolveOrgIdForUserServer` (deleted 2026-09-19, in review)
// ---------------------------------------------------------------------------
//
// It answered "which organization does this webhook write belong to?" with
// `ensure_personal_organization(userId)` — the named person's PERSONAL
// workspace — and, until earlier the same day, with the platform's own system
// organization when no person could be named at all. It was the last
// substitution left in this repo, and it was allowlisted past the guard
// (`scripts/no-default-organization.allowlist.json`, rule 2) on the reasoning
// that "a Twilio webhook has no session and nobody to ask, and every
// `communication.*` table declares `organization_id NOT NULL`, so the
// ruling's org-less shape cannot be expressed."
//
// THAT REASONING WAS WRONG, and the allowlist entry hid it rather than
// tracking it. It assumed the organization had to be resolved from a PERSON.
// It does not: a phone number is REGISTERED, and the registration already
// carries the organization —
// `communication.sms_phone_numbers.organization_id` and
// `communication.sms_notification_preferences.organization_id` are both NOT
// NULL (verified live, 2026-09-19). The answer was sitting in the database the
// whole time. Nothing needed to be chosen, so nothing may be.
//
// The three call sites now read the organization off the registration:
//   • `lib/sms/receive.ts`  — the number the text was sent TO, then the
//     sender's enrolment; neither resolving is an `SmsInboundRoutingFailure`
//     (`lib/sms/routingFailure.ts`), logged and surfaced, never filed.
//   • `lib/sms/send.ts`     — the notified person's own enrolment row.
//   • `lib/sms/numbers.ts`  — the CALLER names it; `app/api/sms/numbers`
//     refuses with the `organization_required` envelope when it does not.
//
// The allowlist entry is retired with it. Do not bring either back: a helper
// whose whole job is to answer an organization question on the person's behalf
// is the class this campaign exists to close.
