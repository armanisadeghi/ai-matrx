import "@/styles/shell.css";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { Providers } from "@/app/Providers";
import { mapUserData } from "@/utils/userDataMapper";
import { getAdminStatus } from "@/utils/supabase/userSessionData";
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
  const supabase = await createClient();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      getAdminStatus(supabase, user.id),
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
        <input type="checkbox" id="shell-sidebar-toggle" aria-hidden="true" />
        <input type="checkbox" id="shell-mobile-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-user-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-toggle" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-mobile" aria-hidden="true" />

        <Sidebar pathname={pathname} />
        <Header userData={userData} />

        <main className="shell-main">{children}</main>

        <MobileSideSheet />
      </div>

      <GlassPortal>
        <MobileDock />
      </GlassPortal>

      <NavActiveSync />
      <VisualViewportSync />
      <DeferredIslands />
    </Providers>
  );
}
