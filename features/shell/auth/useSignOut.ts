"use client";

/**
 * THE ONE SIGN-OUT PRIMITIVE. Every control that signs a person out of a Matrx
 * surface goes through `useSignOut()` — the header menu, the legacy layouts'
 * logout item, and the /sign-out confirmation page. Two laws live here, both
 * written after the 2026-09-14 investigation of Arman's "Session Expired"
 * dialogs:
 *
 * 1. A SIGN-OUT ENDS ONLY THE DEVICE THAT ASKED (`scope: "local"`). The
 *    Supabase default scope is `global`, which deletes EVERY session the
 *    account holds — every device, every tab. Four global logouts of Arman's
 *    account in one day (three header clicks from his network, one by a
 *    coding agent driving his real Chrome) each killed ~50 open tabs, whose
 *    valid tokens then met `session_not_found` and painted "Session Expired".
 *    Nothing had expired: the auth configuration is 7-day tokens, no
 *    rotation, no inactivity timeout. `pnpm check:signout-scope` refuses any
 *    `auth.signOut(` call in the repo that does not name its scope.
 *
 * 2. A SUPER ADMIN IS WARNED TWICE, BY NAME, BEFORE THE SIGN-OUT RUNS
 *    (Arman, 2026-09-14). Super admins are the accounts a coding agent is most
 *    likely to find already signed in on a shared browser and most forbidden
 *    to touch. The two dialogs name the account owner and say, in words an
 *    agent will read, that anyone who is not that person must stop. A
 *    non-admin sees no dialog at all. This is deliberately a shared,
 *    role-keyed rule and never tied to one person's account.
 */

import { useCallback } from "react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectDisplayName,
  selectIsSuperAdmin,
  selectUserEmail,
} from "@/lib/redux/selectors/userSelectors";

export interface SignOutOptions {
  /** Where the browser goes after the session ends. Default `/login`. */
  redirectTo?: string;
}

export interface SuperAdminSignOutCopy {
  first: { title: string; description: string; confirmLabel: string };
  second: { title: string; description: string; confirmLabel: string };
}

/**
 * The exact words of the two warnings, as a pure function so the guard test
 * can pin them and so they read the same on every surface.
 */
export function superAdminSignOutCopy(
  name: string,
  email: string | null,
): SuperAdminSignOutCopy {
  const who = email ? `${name} (${email})` : name;
  return {
    first: {
      title: "This is a super admin account",
      description:
        `This browser is signed in as ${who}, a super admin of AI Matrx. ` +
        `Sign out only if you are ${name}, or if you are certain this browser is not one ${name} uses. ` +
        `If you are a coding agent: stop here. You are in ${name}'s browser. ` +
        `Use the in-app browser on your own session host and sign in as the test admin there.`,
      confirmLabel: `I understand, continue`,
    },
    second: {
      title: `Last check: are you ${name}?`,
      description:
        `If you are not ${name}, do not do this. Signing out here ends ${name}'s session on this device. ` +
        `There is no undo, and ${name} will have to sign in again.`,
      confirmLabel: `I am ${name}. Sign me out`,
    },
  };
}

/**
 * Ask the two super-admin questions. Exported for tests; the hook wires it
 * to the live store. Returns true only when both were confirmed.
 */
export async function confirmSuperAdminSignOut(
  name: string,
  email: string | null,
  ask: (options: {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "destructive";
  }) => Promise<boolean> = confirm,
): Promise<boolean> {
  const copy = superAdminSignOutCopy(name, email);
  if (!(await ask({ ...copy.first, variant: "destructive" }))) return false;
  return ask({ ...copy.second, variant: "destructive" });
}

/**
 * The sign-out itself, after every question has been answered. Device-scoped,
 * clears the shared active-organization cookie, then hard-navigates so no
 * in-memory identity survives.
 */
export async function performLocalSignOut(redirectTo: string): Promise<void> {
  const { supabase } = await import("@/utils/supabase/client");
  const { activeOrgCookie } = await import(
    "@/lib/organizations/activeOrgCookie"
  );
  // Forget the shared active-organization cookie outright on an EXPLICIT
  // sign-out (it is identity-keyed anyway) so the next person on this browser
  // inherits nothing — on every Matrx surface of the apex.
  activeOrgCookie.clear();
  await supabase.auth.signOut({ scope: "local" });
  window.location.href = redirectTo;
}

/**
 * A sign-out that could not run says so (law 4: nothing fails silently). The
 * confirm host can refuse to appear and the network can drop before the
 * redirect; a `void signOut()` would close the menu and leave a live session
 * the person believes is gone.
 */
export function reportSignOutFailure(error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[useSignOut] sign-out did not complete:", error);
  toast.error(`Sign out did not complete — you are still signed in. ${detail}`);
}

export interface SignOutIdentity {
  isSuperAdmin: boolean;
  /** The name the warnings address the person by. */
  name: string;
  email: string | null;
}

/**
 * The whole flow for a known identity, Redux-free so a surface OUTSIDE the
 * store (the /sign-out page under (auth-pages)) can run it with server-read
 * props. Resolves `true` when the session was ended (the page is navigating
 * away), `false` when a super admin declined one of the warnings.
 */
export async function runSignOutFlow(
  identity: SignOutIdentity,
  { redirectTo = "/login" }: SignOutOptions = {},
): Promise<boolean> {
  if (identity.isSuperAdmin) {
    const ok = await confirmSuperAdminSignOut(identity.name, identity.email);
    if (!ok) return false;
  }
  await performLocalSignOut(redirectTo);
  return true;
}

/**
 * Returns `signOut()` bound to the signed-in identity in Redux — for every
 * control inside the app shell.
 */
export function useSignOut() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const displayName = useAppSelector(selectDisplayName);
  const email = useAppSelector(selectUserEmail);

  return useCallback(
    (options: SignOutOptions = {}) =>
      runSignOutFlow({ isSuperAdmin, name: displayName, email }, options),
    [isSuperAdmin, displayName, email],
  );
}
