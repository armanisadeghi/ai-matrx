// app/(dev)/layout.dev.tsx
//
// Top-level layout for development / demo / test surfaces. Everything under
// (dev) resolves under /demos/* — the single consolidated URL prefix for all
// internal demos, tests, and showcase pages.
//
// Auth is required at this layout. Public demos that previously lived at
// /demos/* (under (public)/demos) moved to a sibling (public-demos) group
// — they share the /demos/* URL space but use PublicProviders, no auth.
//
// Build gate: this file and every other route leaf under (dev) is named
// *.dev.tsx so that, in the production-core build, `pageExtensions` does
// not match it and Next.js skips the entire (dev) route tree. The internal
// demos deploy runs with MATRX_PROFILE=full and includes everything here.
// See next.config.js (top of file) for the MATRX_PROFILE wiring.
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
