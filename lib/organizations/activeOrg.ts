// lib/organizations/activeOrg.ts
//
// The ONE canonical, synchronous way to read the signed-in user's GLOBAL
// active organization id from OUTSIDE React — the parallel of
// `utils/auth/getUserId.ts` for org instead of user.
//
// Source of truth is Redux ONLY: `appContext.organization_id`, the org the
// user explicitly selected for the current request context. A personal org is
// identity metadata, not a transport fallback and not a write fallback: there
// is no `?? personal_organization_id` here any more (2026-09-17). Boot is
// TOTAL since 2026-09-12 — `resolveActiveOrgContext` rung (b) explicitly
// SELECTS the user's own personal workspace at bootstrap when nothing else
// applies — so a null here means genuinely unresolved (no memberships) or not
// yet hydrated, never "they have a personal org we could have used".
//
// Why this exists: org is now required on every org-scoped write. Service
// callsites must always attach the user's CURRENT org — not a per-callsite
// guess and not the personal org. Request transports use
// `requireSelectedOrgId()` so missing context fails before networking.
//
// Law: common-docs/policies/context-is-carried-never-rebuilt.md — the
// organization is READ below the boundary, never invented, defaulted or
// substituted.
//
// CRITICAL: imports ONLY from the cycle-free `store-singleton` leaf module —
// never from `@/lib/redux/store` or the slice — so service modules can import
// this without dragging the reducer/middleware graph into their chunk (same
// constraint and reasoning as `utils/auth/getUserId.ts`). The narrow
// `appContext` shape is declared inline for the same reason.

import { getStoreSingleton as getStore } from "@/lib/redux/store-singleton";
// The ONE error type for "no organization is selected" — the same class the
// transport kernel throws (`@ai-matrx/agents/matrx`, re-exported by
// `lib/api/organization-context`). Two different error shapes for one fact
// meant every surface had to string-match one of them, so the screens showed a
// raw transport sentence instead of an honest state; there is now one type and
// one recogniser (`isOrganizationRequiredError`).
import { OrganizationContextError } from "@ai-matrx/agents/matrx";

interface AppContextOrgShape {
  organization_id: string | null;
}

/**
 * The user's explicitly-SELECTED organization id, or null when none is
 * selected. This is the ONE read: there is no personal-organization fallback,
 * because a transport or a write that quietly substitutes the personal
 * workspace files the person's work in an organization they never chose.
 * Null means "no selection" — surfaces render `OrganizationRequiredNotice`
 * (see `organizationRequiredError.ts`) and writes refuse.
 */
export function getActiveOrgId(): string | null {
  const store = getStore();
  if (!store) return null;
  const appContext = (store.getState() as { appContext?: AppContextOrgShape })
    .appContext;
  if (!appContext) return null;
  return appContext.organization_id ?? null;
}

/** Alias of `getActiveOrgId` — the two reads became identical when the
 * personal-org fallback was deleted (2026-09-17). Mirrors `selectOrganizationId`. */
export const getSelectedOrgId = getActiveOrgId;

/** Alias of `requireSelectedOrgId` — same reason as `getSelectedOrgId`. */
export function requireActiveOrgId(): string {
  return requireSelectedOrgId();
}

/**
 * Return the explicitly selected request organization or fail before I/O.
 * Personal-organization identity is deliberately ignored: silently choosing
 * it would make the transport invent scope instead of carrying user context.
 */
export function requireSelectedOrgId(): string {
  const id = getSelectedOrgId();
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new OrganizationContextError(
      "organization_context_required",
      "Select an organization before sending this request.",
    );
  }
  return id.trim();
}
