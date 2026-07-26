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
// Chrome is the shared `AppShell` — the SAME modern shell `(core)` uses — so
// admin gets the full sidebar + header (and `#shell-header-center`). Admin
// pages keep the "content below the header" model via a scoped `.shell-main`
// rule in `styles/shell.css` (`.shell-root[data-pathname^="/administration"]`).
//
// No metadata export — child routes (e.g. /administration/*) set their own
// titles and favicons.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  checkIsSuperAdmin,
  type AdminLevel,
} from "@/utils/supabase/userSessionData";
import type { BaseReduxState } from "@/types/reduxTypes";
import NavigationLoader from "@/components/loaders/NavigationLoader";
import AppShell from "@/features/shell/components/AppShell";
import { readSidebarExpandedCookie } from "@/features/shell/utils/server-cookies";

// Admin pages require authentication and cannot be statically generated
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/administration";
  const sidebarExpanded = await readSidebarExpandedCookie();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Preserve the intended destination through the login round-trip.
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

  const initialReduxState: BaseReduxState = {
    user: userData,
  };

  return (
    <AppShell
      initialReduxState={initialReduxState}
      userData={userData}
      isAuthenticated
      pathname={pathname}
      sidebarExpanded={sidebarExpanded}
    >
      <NavigationLoader />
      {children}
    </AppShell>
  );
}
