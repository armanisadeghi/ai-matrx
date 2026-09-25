import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ADMIN_LANE_HEADER } from "@/utils/supabase/adminLane";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import type { BaseReduxState } from "@/types/reduxTypes";
// Phase 4 PR 4.C: removed `setGlobalUserIdAndToken` import — `lib/globalState.ts`
// is deleted in this PR. The Redux preloaded state below carries the user data;
// `lib/sync/identity::attachStore` (called from StoreProvider) wires the
// reactive identity source so non-React consumers see the current state.
import AppShell from "@/features/shell/components/AppShell";
import { readSidebarExpandedCookie } from "@/features/shell/utils/server-cookies";
import type { UserData } from "@/utils/userDataMapper";
import type { Metadata } from "next";
import { InternalGoogleAnalytics } from "@/lib/product-analytics/InternalGoogleAnalytics";

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

  // 🚨 AN AUTHORITY WE COULD NOT REACH IS NOT A SIGNED-OUT PERSON.
  //
  // `serverClient` bounds the identity resolve at 2.5s (`createAuthBudget` in
  // @ai-matrx/data/next). When that budget is spent the resolve hands back
  // `user: null` — which looks EXACTLY like a guest. Rendering the guest shell
  // on it is not a cosmetic slip: `isAuthenticated` is what strips the nav
  // items, the favorites group, the org switcher, the inbox, and swaps the user
  // block for a Sign In button. A signed-in person would watch their whole
  // application disappear because the network blinked for two seconds.
  //
  // It is also NOT self-healing. The client re-resolves identity after
  // hydration (`DeferredShellData`) and repairs Redux — but this shell's chrome
  // is driven by a SERVER prop the client never revisits, so the guest shell
  // would sit there, lying, until the next navigation.
  //
  // So we hold, exactly as `(admin)` and `(transitional)` do: shell chrome, one
  // honest sentence, no redirect and no "signed out" claim. This costs a guest
  // nothing — a genuine guest resolves cleanly (`getClaims()` reports "no
  // session" as an answer, with `error: null`), so `authUnavailable` is only
  // ever the "we could not tell" case.
  if (authUnavailable) {
    console.warn(
      `[(core)/layout] identity could not be verified for ${pathname} — holding the shell, NOT rendering it as signed out.`,
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
        <div className="p-4 text-sm text-muted-foreground">
          We could not verify who you are on this request, so this page is not
          loading its data. You have not been signed out — reload in a moment.
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();

  let initialReduxState: BaseReduxState;
  let userData: UserData;
  let enableInternalAnalytics = false;

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
    enableInternalAnalytics =
      adminLevel === "super_admin" && !pathname.startsWith("/education");
    const accessToken = session?.access_token;
    userData = mapUserData(user, accessToken, isAdmin, adminLevel);

    initialReduxState = {
      user: userData,
      // THE ADMIN LANE seed: the per-feature admin maps under (core) are admin
      // section; `proxy.ts` stamped the request (utils/supabase/adminLane.ts).
      adminLaneOpen: headersList.get(ADMIN_LANE_HEADER) === "1",
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
      {enableInternalAnalytics ? <InternalGoogleAnalytics /> : null}
    </AppShell>
  );
}
