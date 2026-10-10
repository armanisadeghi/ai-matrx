// app/(transitional)/layout.tsx
//
// Holding pen for routes that are "on the way in or on the way out" — they
// have been (or will be) replaced by surfaces in (core) but aren't ready to
// delete yet. They render in the SAME AppShell as (core) and (admin): one
// sidebar, one header and one account rail a person can always count on
// (owner, 2026-09-30). The group's only difference from (core) is that every
// route here needs a signed-in person.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import type { BaseReduxState } from "@/types/reduxTypes";
import AppShell from "@/features/shell/components/AppShell";
import { readSidebarExpandedCookie } from "@/features/shell/utils/server-cookies";
import {
  captureAuthDestination,
  loginHref,
} from "@/utils/auth/auth-destination";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export default async function TransitionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const sidebarExpanded = await readSidebarExpandedCookie();

  // Identity comes from the access token's claims, verified LOCALLY against the
  // project JWKS — no auth-server round trip on a page render, and the whole
  // tree shares one resolve per request.
  const { user, authUnavailable } = await getServerAuth();

  if (!user) {
    // 🚨 An auth authority we could not REACH is not a signed-out person: hold
    // the shell with one honest sentence, exactly as (core) does — never a
    // redirect, or a network blink becomes a logout mid-session.
    if (authUnavailable) {
      console.warn(
        `[(transitional)/layout] identity could not be verified for ${pathname} — holding the shell, NOT redirecting to /login.`,
      );
      const unresolvedUserData = mapUserData(null, undefined, false);
      return (
        <AppShell
          initialReduxState={{ user: unresolvedUserData }}
          userData={unresolvedUserData}
          isAuthenticated={false}
          pathname={pathname}
          sidebarExpanded={sidebarExpanded}
        >
          <div data-error-box className="p-4 text-sm text-muted-foreground">
            We could not verify who you are on this request, so this page is not
            loading its data. You have not been signed out — reload in a moment.
          <ErrorAlchemyMenu /></div>
        </AppShell>
      );
    }
    // The proxy already sends signed-out people to login; this is the safety
    // net, and it carries the destination so nobody loses their place.
    const destination = captureAuthDestination(
      headersList.get("x-pathname"),
      headersList.get("x-search-params"),
    );
    return redirect(loginHref(destination));
  }

  const supabase = await createClient();
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
  const userData = mapUserData(user, session?.access_token, isAdmin, adminLevel);
  const initialReduxState: BaseReduxState = { user: userData };

  return (
    <AppShell
      initialReduxState={initialReduxState}
      userData={userData}
      isAuthenticated
      pathname={pathname}
      sidebarExpanded={sidebarExpanded}
    >
      {/* These pages were built for the old frame's solid header; the shell
          header floats over the top of `.shell-main`, so the group starts its
          content below it — once, here, for every page in the group — and
          `h-page` (100dvh minus `--header-height`) measures against the same
          header, so a full-height page fits exactly. */}
      <div
        className="min-h-full w-full pt-[var(--shell-header-h)]"
        style={{ "--header-height": "var(--shell-header-h)" } as React.CSSProperties}
      >
        {children}
      </div>
    </AppShell>
  );
}
