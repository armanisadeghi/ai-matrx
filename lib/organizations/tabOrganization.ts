// lib/organizations/tabOrganization.ts
//
// THIS TAB'S ORGANIZATION, REMEMBERED ACROSS ITS OWN RELOADS (2026-10-08).
//
// The load ladder's rung 0 is "the organization this tab holds". It used to
// live only in Redux, so a reload — or any full navigation in the same tab —
// started with nothing held and fell to rung 2, the ACCOUNT's
// `last_active_organization_id`. Every other signed-in session of the same
// account moves that value on each switch, so a tab that reloaded between two
// creates silently changed organization: three study kits made back-to-back
// by one person landed in three organizations (2026-10-08, 03:22–03:38 UTC).
//
// sessionStorage is exactly "this tab": it survives a reload of the tab and is
// invisible to every other tab. A brand-new tab has none and opens to the
// account's last active, as the ladder says.
//
// Written by `tabOrganizationMiddleware` only for an ANSWERED organization
// (the ladder's answer or the person's own switch) — a painted browser cache
// value is never remembered. Read only by the ladder's callers
// (`appContextPolicy.remote.fetch`, `bootstrapActiveOrganization`), and kept
// only while it is still a membership (the resolver checks).

import type { Middleware } from "@reduxjs/toolkit";
import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";

const KEY = "matrx:tabOrganization";

interface Remembered {
  userId: string;
  organizationId: string;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null; // storage disabled — the tab simply holds nothing
  }
}

/** The organization this tab last held for this person, or null. */
export function readTabOrganization(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const raw = storage()?.getItem(KEY);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<Remembered>;
    return r.userId === userId && typeof r.organizationId === "string" && r.organizationId
      ? r.organizationId
      : null;
  } catch {
    return null;
  }
}

export function rememberTabOrganization(userId: string, organizationId: string): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ userId, organizationId } satisfies Remembered));
  } catch (err) {
    console.warn("[tabOrganization] could not remember this tab's organization", err);
  }
}

/**
 * The tab's held organization for the ladder: Redux's answered one, else the
 * one this tab remembered before it reloaded.
 */
export function heldOrganizationForTab(
  appContext: { orgBootstrapResolved?: boolean; organization_id?: string | null } | undefined,
  userId: string | null | undefined,
): string | null {
  if (appContext?.orgBootstrapResolved && appContext.organization_id) {
    return appContext.organization_id;
  }
  return readTabOrganization(userId);
}

interface StateShape {
  appContext?: { organization_id?: unknown; orgBootstrapResolved?: unknown };
  userAuth?: { id?: unknown };
}

/** Mirrors every ANSWERED active organization of this tab into sessionStorage. */
export const tabOrganizationMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  const type = (action as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || (!type.startsWith("appContext/") && type !== REHYDRATE_ACTION_TYPE)) {
    return result;
  }
  const state = storeApi.getState() as StateShape;
  const org = state.appContext?.organization_id;
  const userId = state.userAuth?.id;
  if (
    state.appContext?.orgBootstrapResolved === true &&
    typeof org === "string" &&
    org &&
    typeof userId === "string" &&
    userId &&
    readTabOrganization(userId) !== org
  ) {
    rememberTabOrganization(userId, org);
  }
  return result;
};
