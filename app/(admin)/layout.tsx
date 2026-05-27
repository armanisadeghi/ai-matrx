// app/(admin)/layout.tsx
//
// Top-level layout for the admin route branch. Combines the auth check +
// provider stack from the legacy `(authenticated)/layout.tsx` with the
// super-admin gate from the legacy `(authenticated)/(admin-auth)/layout.tsx`.
//
// Routes under this group resolve at `/administration/*` via the inner
// `administration/` folder. The `(admin)` parens are a route group and
// do not affect URLs.
//
// No metadata export — child routes (e.g. /administration/*) set their own
// titles and favicons.
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
  checkIsSuperAdmin,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import { getEmptyGlobalCache } from "@/utils/schema/schema-processing/emptyGlobalCache";
import type { InitialReduxState } from "@/types/reduxTypes";
import NavigationLoader from "@/components/loaders/NavigationLoader";
import ResponsiveLayout from "@/components/layout/new-layout/ResponsiveLayout";

// Admin pages require authentication and cannot be statically generated
export const dynamic = "force-dynamic";

const emptyGlobalCache = getEmptyGlobalCache();

export default async function AdminLayout({
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
    // Preserve the intended destination through the login round-trip.
    const pathname = headersList.get("x-pathname") || "/dashboard";
    const searchParams = headersList.get("x-search-params") || "";
    const fullPath = searchParams ? `${pathname}${searchParams}` : pathname;
    return redirect(`/login?redirectTo=${encodeURIComponent(fullPath)}`);
  }

  // Highest-bar gate: only Super Admin can enter the admin route tree by
  // default. Selective lowering happens per-page if/when needed.
  const isSuperAdmin = await checkIsSuperAdmin(supabase, user.id);
  if (!isSuperAdmin) {
    return redirect("/dashboard");
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
