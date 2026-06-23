import "@/styles/shell.css";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { Providers } from "@/app/Providers";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import { getEmptyGlobalCache } from "@/utils/schema/schema-processing/emptyGlobalCache";
import type { InitialReduxState } from "@/types/reduxTypes";
// Phase 4 PR 4.C: removed `setGlobalUserIdAndToken` import — `lib/globalState.ts`
// is deleted in this PR. The Redux preloaded state below carries the user data;
// `lib/sync/identity::attachStore` (called from StoreProvider) wires the
// reactive identity source so non-React consumers see the current state.
import Sidebar from "@/features/shell/components/sidebar/Sidebar";
import Header from "@/features/shell/components/header/Header";
import MobileDock from "@/features/shell/components/dock/MobileDock";
import MobileSideSheet from "@/features/shell/components/mobile-sheet/MobileSideSheet";
import GlassPortal from "@/features/shell/components/GlassPortal";
import NavActiveSync from "@/features/shell/components/NavActiveSync";
import VisualViewportSync from "@/features/shell/components/VisualViewportSync";
import ShellSidebarCookieSync from "@/features/shell/components/ShellSidebarCookieSync";
import { readSidebarExpandedCookie } from "@/features/shell/utils/server-cookies";
import DeferredIslands from "@/features/shell/islands/DeferredIslands";
import type { UserData } from "@/utils/userDataMapper";
import type { Metadata } from "next";

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

const emptyGlobalCache = getEmptyGlobalCache();

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const sidebarExpanded = await readSidebarExpandedCookie();

  // Request-scoped cached auth lookup — child server layouts/pages that also
  // call `getServerAuth()` share this validated `getUser()` result, so each
  // request only pays one JWT-validation round-trip across the whole tree.
  const { user, isAuthenticated } = await getServerAuth();
  const supabase = await createClient();

  let initialReduxState: InitialReduxState;
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
      globalCache: emptyGlobalCache,
    };
  } else {
    const guestUserData = mapUserData(null, undefined, false);
    userData = guestUserData;

    initialReduxState = {
      user: guestUserData,
      globalCache: emptyGlobalCache,
    };
  }

  return (
    <Providers initialReduxState={initialReduxState}>
      <div className="shell-root" data-pathname={pathname}>
        <input
          type="checkbox"
          id="shell-sidebar-toggle"
          aria-hidden="true"
          defaultChecked={sidebarExpanded}
        />
        <input type="checkbox" id="shell-mobile-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-user-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-toggle" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-mobile" aria-hidden="true" />

        <Sidebar pathname={pathname} isAuthenticated={isAuthenticated} />
        <Header userData={userData} isAuthenticated={isAuthenticated} />

        <main className="shell-main">{children}</main>

        <MobileSideSheet isAuthenticated={isAuthenticated} />
      </div>

      <GlassPortal>
        <MobileDock isAuthenticated={isAuthenticated} />
      </GlassPortal>

      <NavActiveSync />
      <VisualViewportSync />
      <ShellSidebarCookieSync />
      <DeferredIslands />
    </Providers>
  );
}
