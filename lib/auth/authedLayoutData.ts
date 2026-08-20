// lib/auth/authedLayoutData.ts
//
// Shared server-side helper used by every authed layout to perform the
// auth + admin-check + viewport sniff in one place. Created during the
// entity-isolation migration so that both `app/(authenticated)/layout.tsx`
// and the new `app/(legacy)/layout.tsx` can stay thin.
//
// `loadAuthedLayoutData()` redirects to /login if there is no session, so
// callers can treat the return value as guaranteed-authenticated. The
// `accessToken` may still be undefined if `getSession()` returns no session
// for some edge case — preserved as the original layouts treated it.

import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
