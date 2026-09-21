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
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData } from "@/utils/userDataMapper";
import {
  getAdminStatus,
  checkIsUserAdmin,
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

  const { user, authUnavailable } = await getServerAuth();

  if (!user) {
    // 🚨 An auth authority we could not REACH is not a signed-out admin. The
    // proxy passes these requests through rather than bouncing them, and so
    // does this layout: a login redirect here would throw a signed-in admin
    // out mid-session over a network blink, and the destination capture would
    // rewrite where they were going. Say what happened instead.
    if (authUnavailable) {
      console.warn(
        `[(admin)/layout] identity could not be verified for ${pathname} — rendering the retry shell, NOT redirecting to /login.`,
      );
      const guestUserData = mapUserData(null, undefined, false);
      return (
        <AppShell
          initialReduxState={{ user: guestUserData }}
          userData={guestUserData}
          isAuthenticated={false}
          pathname={pathname}
          sidebarExpanded={sidebarExpanded}
        >
          <div className="p-4 text-sm text-muted-foreground">
            We could not verify who you are on this request, so administration
            is not showing its data. You have not been signed out — reload in a
            moment.
          </div>
        </AppShell>
      );
    }
    // Preserve the intended destination through the login round-trip.
    const searchParams = headersList.get("x-search-params") || "";
    const fullPath = searchParams ? `${pathname}${searchParams}` : pathname;
    return redirect(`/login?redirectTo=${encodeURIComponent(fullPath)}`);
  }

  // Gate: ANY Matrx admin (developer / senior_admin / super_admin) may enter
  // the admin route tree (Arman's 2026-07-23 directive — stop forcing people to
  // super_admin just to reach admin surfaces). Pages that genuinely need a
  // higher bar self-gate with `selectAdminLevel` / the super-admin RPC family;
  // protected resources (admins table, etc.) are DB-gated regardless. The real
  // authorization always lives at the data layer, never this redirect.
  const isAdminGate = await checkIsUserAdmin(supabase, user.id);
  if (!isAdminGate) {
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
