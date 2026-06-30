// lib/organizations/activeOrg.ts
//
// The ONE canonical, synchronous way to read the signed-in user's GLOBAL
// active organization id from OUTSIDE React — the parallel of
// `utils/auth/getUserId.ts` for org instead of user.
//
// Source of truth is Redux ONLY: `appContext.organization_id` (the org the
// user has explicitly selected) with `appContext.personal_organization_id` as
// the never-empty fallback. This is exactly `selectEffectiveOrganizationId`
// from `appContextSlice`, read here without a React hook for service/util code.
//
// Why this exists: org is now required on every org-scoped write. Service
// callsites must always attach the user's CURRENT org — not a per-callsite
// guess and not just the personal org. Read this (or `ensureOrgId`, which
// layers a personal-org RPC fallback on top) instead of writing a null
// `organization_id`.
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
 * The user's GLOBAL active organization id, read synchronously from Redux:
 * the explicitly-selected org, else the personal org, else null (store not
 * yet hydrated). Mirrors `selectEffectiveOrganizationId`. No network.
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
 * Like `getActiveOrgId` but throws if no org is resolvable (store not
 * hydrated). For synchronous callsites that cannot proceed without an org and
 * do not want the async personal-org RPC fallback. Most writes should use the
 * async `ensureOrgId` instead, which can recover via RPC.
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
