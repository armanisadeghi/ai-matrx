// lib/organizations/ensureOrgId.ts
//
// The ONE funnel through which an org-scoped write gets the organization it
// acts in (active-organization plan, 2026-10-07):
//
//   ensureOrgId(x)    — a record's or parent's own organization: returns x.
//   ensureOrgId(null) — the ACTIVE organization, after the load ladder has
//                       answered from the account. It never prompts and never
//                       picks: the shell always has an active organization, so
//                       a write simply carries it.
//
// `ensureOrgIdServer` REFUSES with the caller's memberships attached.

import type { SupabaseClient } from "@supabase/supabase-js";
import { organizationRequired } from "@/lib/organizations/organizationRequiredServerError";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
// Cycle-free leaf (same constraint as activeOrg.ts) — never `@/lib/redux/store`.
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
// The ONE "has the load ladder answered yet?" promise, settled by the ladder
// (appContextPolicy.remote.fetch / activeOrgBootstrap) or the person's switch.
import {
  isOrgBootstrapResolved,
  whenOrgBootstrapResolved,
} from "@/lib/organizations/orgBootstrapGate";

/**
 * The organization an org-scoped write acts in.
 *
 *   1. an explicitly-passed `orgId` (the record's or parent's own) — returned
 *      as is; acting on a record never touches the active organization;
 *   2. otherwise the ACTIVE organization — but only once the load ladder has
 *      answered from the account. A browser cache may PAINT an organization
 *      before then; no request is sent on it, because the account's answer
 *      (last active → start-up → first) may differ and wins.
 *
 * It never prompts. With no active organization after the ladder (no
 * memberships, or the membership read failed) it throws
 * `OrganizationContextError` with the honest reason — the shell already shows
 * the create-an-organization screen or the retry state.
 *
 * Law: common-docs/policies/context-is-carried-never-rebuilt.md.
 */
export async function ensureOrgId(
  orgId: string | null | undefined,
): Promise<string> {
  if (orgId) return orgId;
  // Answered = the ladder settled the gate, or this tab's slice says so (a
  // ladder REHYDRATE or the person's own switch both set it; a painted cache
  // never does).
  const answered = () =>
    isOrgBootstrapResolved() || readAppContext()?.orgBootstrapResolved === true;
  if (!answered()) await whenOrgBootstrapResolved();
  if (!answered()) {
    throw new OrganizationContextError(
      "organization_context_required",
      "Still checking your organizations. Try again in a moment.",
    );
  }
  const activeOrgId = getActiveOrgId();
  if (activeOrgId) return activeOrgId;
  throw new OrganizationContextError(
    "organization_context_required",
    readAppContext()?.orgBootstrapFailure
      ? "We couldn't check your organizations. Try again."
      : "You don't belong to an organization yet. Create one to continue.",
  );
}

function readAppContext():
  | { orgBootstrapResolved?: boolean; orgBootstrapFailure?: string | null }
  | undefined {
  return (
    getStoreSingleton()?.getState() as
      | {
          appContext?: {
            orgBootstrapResolved?: boolean;
            orgBootstrapFailure?: string | null;
          };
        }
      | undefined
  )?.appContext;
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
