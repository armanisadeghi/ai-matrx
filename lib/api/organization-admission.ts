/**
 * Organization ADMISSION for background transports — the one answer to
 * "may I bind an organization header yet, and to what?".
 *
 * The server's AuthMiddleware admits a JWT-authenticated request only with an
 * `X-Organization-Id` it can verify, admits the fingerprint-guest lane with no
 * organization at all (a guest has no membership to verify), and never chooses
 * an organization for the caller. The client half of that contract has TWO
 * failure modes this module exists to end:
 *
 *  1. Binding fail-closed on the GUEST lane — a public demo or marketing
 *     surface throwing "Select an organization" at an anonymous visitor who
 *     can never satisfy it (live: /demos/lulu-pricing, 2026-08-31).
 *  2. Binding at BOOT, before the app-context organization hydrates — burning
 *     refused requests against the gate (~511 [AUTH][REJECT] POST
 *     /files/session in ~35 minutes from one user, 2026-08-31).
 *
 * `waitForOrganizationAdmission()` resolves "ready" the moment an organization
 * is selected, "unresolved" when the active-org bootstrap has authoritatively
 * finished with NO selection (or the bounded wait expires — SSR/tests/no
 * store). It never guesses and never picks an organization.
 *
 * First consumer: `lib/python-client.ts`. `features/files/media-client` has an
 * earlier private copy of the same wait — consolidate it onto this module when
 * next touched (tracked in features/files/FEATURE.md).
 */

import type { RootState } from "@/lib/redux/store";
import { getStore } from "@/lib/redux/store-singleton";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";

export type OrganizationAdmission = "ready" | "unresolved";

/** Bootstrap completes in milliseconds; this only bounds a broken boot. */
const ORGANIZATION_ADMISSION_TIMEOUT_MS = 8_000;

function readAdmission(state: RootState): OrganizationAdmission | null {
  if (selectOrganizationId(state)) return "ready";
  if (selectOrgBootstrapResolved(state)) return "unresolved";
  return null;
}

/** The currently selected organization id, or null. Never waits. */
export function peekSelectedOrganizationId(): string | null {
  const store = getStore();
  if (!store) return null;
  return selectOrganizationId(store.getState() as RootState) ?? null;
}

export function waitForOrganizationAdmission(): Promise<OrganizationAdmission> {
  const store = getStore();
  if (!store) return Promise.resolve("unresolved");

  const immediate = readAdmission(store.getState() as RootState);
  if (immediate) return Promise.resolve(immediate);

  return new Promise<OrganizationAdmission>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (verdict: OrganizationAdmission) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(verdict);
    };
    const timer = setTimeout(
      () => finish("unresolved"),
      ORGANIZATION_ADMISSION_TIMEOUT_MS,
    );
    unsubscribe = store.subscribe(() => {
      const verdict = readAdmission(store.getState() as RootState);
      if (verdict) finish(verdict);
    });
    // The bootstrap can land between the first read and the subscription.
    const raced = readAdmission(store.getState() as RootState);
    if (raced) finish(raced);
  });
}
