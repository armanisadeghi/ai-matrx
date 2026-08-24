// lib/organizations/activeOrg.ts
//
// The ONE canonical, synchronous way to read the signed-in user's GLOBAL
// active organization id from OUTSIDE React — the parallel of
// `utils/auth/getUserId.ts` for org instead of user.
//
// Source of truth is Redux ONLY: `appContext.organization_id`, the org the
// user explicitly selected for the current request context. A personal org is
// identity metadata, not a transport fallback.
//
// Why this exists: org is now required on every org-scoped write. Service
// callsites must always attach the user's CURRENT org — not a per-callsite
// guess and not the personal org. Request transports use
// `requireSelectedOrgId()` so missing context fails before networking.
//
// CRITICAL: imports ONLY from the cycle-free `store-singleton` leaf module —
// never from `@/lib/redux/store` or the slice — so service modules can import
// this without dragging the reducer/middleware graph into their chunk (same
// constraint and reasoning as `utils/auth/getUserId.ts`). The narrow
// `appContext` shape is declared inline for the same reason.

import { getStoreSingleton as getStore } from "@/lib/redux/store-singleton";

interface AppContextOrgShape {
  organization_id: string | null;
  personal_organization_id: string | null;
}

/**
 * Legacy effective-scope read for direct data surfaces: explicitly selected
 * org, else personal org, else null. Never use this for request transport;
 * transports must call `requireSelectedOrgId()`.
 */
export function getActiveOrgId(): string | null {
  const store = getStore();
  if (!store) return null;
  const appContext = (store.getState() as { appContext?: AppContextOrgShape })
    .appContext;
  if (!appContext) return null;
  return appContext.organization_id ?? appContext.personal_organization_id ?? null;
}

/**
 * The user's explicitly-SELECTED org id (no personal-org fallback), or null.
 * Mirrors `selectOrganizationId`. Use only when you specifically need to know
 * whether the user has actively chosen an org; for writes, prefer
 * `getActiveOrgId` / `ensureOrgId`.
 */
export function getSelectedOrgId(): string | null {
  const store = getStore();
  if (!store) return null;
  const appContext = (store.getState() as { appContext?: AppContextOrgShape })
    .appContext;
  return appContext?.organization_id ?? null;
}

/**
 * Legacy throwing effective-scope read for direct data surfaces. This may
 * return the personal org and therefore is forbidden for request transport.
 */
export function requireActiveOrgId(): string {
  const id = getActiveOrgId();
  if (!id) {
    throw new Error(
      "No active organization available (Redux not hydrated). Use ensureOrgId() for an async-recoverable resolution.",
    );
  }
  return id;
}

/**
 * Return the explicitly selected request organization or fail before I/O.
 * Personal-organization identity is deliberately ignored: silently choosing
 * it would make the transport invent scope instead of carrying user context.
 */
export function requireSelectedOrgId(): string {
  const id = getSelectedOrgId();
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Select an organization before sending this request.");
  }
  return id.trim();
}
