// app/(dev)/layout.tsx
//
// Top-level layout for development / demo / test surfaces. Everything under
// (dev) resolves under /demos/* — the single consolidated URL prefix for all
// internal demos, tests, and showcase pages.
//
// Auth policy is set HERE at the (dev) root (not at /demos) so that nested
// sub-layouts can opt out — specifically (dev)/demos/public/, which must
// remain accessible without login because it was previously served from
// (public)/demos and may be linked externally.
//
// Phase 2 (not yet active) will rename leaf files to *.dev.tsx and gate
// inclusion in the production-core build via MATRX_PROFILE in next.config.js.
// Public demos under (dev)/demos/public/ will retain a *.tsx extension so
// they remain in the core build.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { Providers } from "@/app/Providers";
import { mapUserData } from "@/utils/userDataMapper";
import {
  appSidebarLinks,
  adminSidebarLinks,
} from "@/features/shell/navigation/navigationLinks";
import {
  getAdminStatus,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import { getEmptyGlobalCache } from "@/utils/schema/schema-processing/emptyGlobalCache";
import type { InitialReduxState } from "@/types/reduxTypes";
import NavigationLoader from "@/components/loaders/NavigationLoader";
import ResponsiveLayout from "@/components/layout/new-layout/ResponsiveLayout";

const emptyGlobalCache = getEmptyGlobalCache();

export default async function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const headersList = await headers();
  const viewport = headersList.get("viewport-width") || "0";
  const isMobile = Number(viewport) < 768;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
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

  const layoutProps = {
    primaryLinks: appSidebarLinks,
    secondaryLinks: isAdmin ? adminSidebarLinks : [],
    initialOpen: !isMobile ? false : false,
    uniqueId: "matrix-layout-container",
    isAdmin,
    serverIsMobile: isMobile,
  };

  const initialReduxState: InitialReduxState = {
    user: userData,
    globalCache: emptyGlobalCache,
  };

  return (
    <Providers initialReduxState={initialReduxState}>
      <ResponsiveLayout {...layoutProps}>
        <NavigationLoader />
        {children}
      </ResponsiveLayout>
    </Providers>
  );
}
