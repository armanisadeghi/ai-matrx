// lib/auth/authedLayoutData.ts
//
// Shared server-side helper used by every authed layout to perform the
// auth + admin-check + viewport sniff in one place. Created during the
// entity-isolation migration so that both `app/(authenticated)/layout.tsx`
// and the new `app/(legacy)/layout.tsx` can stay thin.
//
// `loadAuthedLayoutData()` redirects to /login when the request carries no
// session, so callers can treat the return value as guaranteed-authenticated.
// The `accessToken` may still be undefined if `getSession()` returns no session
// for some edge case — preserved as the original layouts treated it.
//
// 🚨 Identity comes from `getServerAuth()` — the access token's claims, verified
// LOCALLY — never from `auth.getUser()`, which is an auth-server round trip per
// page render (the 2026-09-21 `504 FUNCTION_INVOCATION_TIMEOUT` class). A
// request whose identity could NOT be verified is not a signed-out person and
// must never be bounced to /login: it throws, so the error boundary says "try
// again" instead of the screen lying about a sign-out.

import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData, type UserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
// Phase 4 PR 4.C: removed `setGlobalUserIdAndToken` import — `lib/globalState.ts`
// is deleted in this PR. Callers receive userData and inject it into the
// Redux preloaded state; `lib/sync/identity::attachStore` then makes it
// available to non-React consumers.

export interface AuthedLayoutData {
  userData: UserData;
  accessToken: string | undefined;
  isAdmin: boolean;
  adminLevel: AdminLevel | null;
  isMobile: boolean;
}

export async function loadAuthedLayoutData(): Promise<AuthedLayoutData> {
  const supabase = await createClient();
  const headersList = await headers();
  const viewport = headersList.get("viewport-width") || "0";
  const isMobile = Number(viewport) < 768;

  const { user, authUnavailable } = await getServerAuth();

  if (authUnavailable) {
    throw new Error(
      "Your identity could not be verified on this request. You are still signed in — reload in a moment.",
    );
  }

  if (!user) {
    redirect(await currentRequestLoginHref());
  }

  const [
    {
      data: { session },
    },
    adminStatus,
  ] = await Promise.all([
    supabase.auth.getSession(),
    getAdminStatus(supabase, user.id).catch((err) => {
      console.error("getAdminStatus failed, defaulting to non-admin:", err);
      return { isAdmin: false, level: null as AdminLevel | null };
    }),
  ]);

  const { isAdmin, level: adminLevel } = adminStatus;
  const accessToken = session?.access_token;
  const userData = mapUserData(user, accessToken, isAdmin, adminLevel);

  return { userData, accessToken, isAdmin, adminLevel, isMobile };
}
