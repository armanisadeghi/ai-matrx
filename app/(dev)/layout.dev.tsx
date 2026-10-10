import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import type { BaseReduxState } from "@/types/reduxTypes";
// THE ONE SHELL: the demo site renders the same AppShell as (core), (admin)
// and (transitional) — it used to wire its own copy of the shell's parts and
// had drifted (owner, 2026-09-30: one sidebar and header everywhere).
import AppShell from "@/features/shell/components/AppShell";
import { readSidebarExpandedCookie } from "@/features/shell/utils/server-cookies";
import type { UserData } from "@/utils/userDataMapper";
import type { Metadata } from "next";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export const metadata: Metadata = {
  title: {
    default: "AI Matrx",
    template: "%s — AI Matrx",
  },
  description: "AI-powered admin dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/matrx/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/matrx/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/matrx/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const sidebarExpanded = await readSidebarExpandedCookie();

  // Request-scoped cached auth lookup — child server layouts/pages that also
  // call `getServerAuth()` share this one locally-verified claims read, so the
  // whole tree pays a single identity resolve per request.
  const { user, isAuthenticated, authUnavailable } = await getServerAuth();

  // 🚨 AN AUTHORITY WE COULD NOT REACH IS NOT A SIGNED-OUT PERSON. Same rule
  // and same reason as `(core)` — the 2.5s resolve budget hands back a null
  // user that is indistinguishable from a guest, and `isAuthenticated` is what
  // decides whether this shell keeps its nav or paints a Sign In button. See
  // `app/(core)/layout.tsx` for the full reasoning; a genuine guest resolves
  // cleanly, so this branch is only ever the "we could not tell" case.
  if (authUnavailable) {
    console.warn(
      `[(dev)/layout] identity could not be verified for ${pathname} — holding, NOT rendering as signed out.`,
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

  const supabase = await createClient();

  let initialReduxState: BaseReduxState;
  let userData: UserData;

  if (user) {
    // Phase 3: admin check is now a narrow single-row lookup on the `admins`
    // table. Preferences fetch has moved client-side to `userPreferencesPolicy`
    // warm-cache cold-boot (IDB → LS → remote.fetch). No preloadedState for
    // userPreferences — the client warms its own cache.
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
    userData = mapUserData(user, accessToken, isAdmin, adminLevel);

    initialReduxState = {
      user: userData,
    };
  } else {
    const guestUserData = mapUserData(null, undefined, false);
    userData = guestUserData;

    initialReduxState = {
      user: guestUserData,
    };
  }

  return (
    <AppShell
      initialReduxState={initialReduxState}
      userData={userData}
      isAuthenticated={isAuthenticated}
      pathname={pathname}
      sidebarExpanded={sidebarExpanded}
    >
      {children}
    </AppShell>
  );
}
