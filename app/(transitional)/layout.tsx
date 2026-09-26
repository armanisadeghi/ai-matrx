// app/(transitional)/layout.tsx
//
// Holding pen for routes that are "on the way in or on the way out" — they
// have been (or will be) replaced by surfaces in (core) but aren't ready to
// delete yet. Uses the same provider stack and shell as the legacy
// (authenticated) group (slim Providers + ResponsiveLayout).
//
// Sibling "transitional family" groups with different provider trees:
//   - (legacy)  — EntityProviders + ResponsiveLayout (entity-bound routes)
//   - (ssr)     — LiteStoreProvider + glass shell (SSR experiment routes)
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
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
import type { BaseReduxState } from "@/types/reduxTypes";
import NavigationLoader from "@/components/loaders/NavigationLoader";
import { headers } from "next/headers";
// Phase 4 PR 4.C: removed `setGlobalUserIdAndToken` import — `lib/globalState.ts`
// is deleted in this PR. The Redux preloaded state below carries the user data;
// `lib/sync/identity::attachStore` (called from StoreProvider) wires the
// reactive identity source so non-React consumers see the current state.
import ResponsiveLayout from "@/components/layout/new-layout/ResponsiveLayout";
import {
  captureAuthDestination,
  loginHref,
} from "@/utils/auth/auth-destination";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const headersList = await headers();
  const viewport = headersList.get("viewport-width") || "0";
  const isMobile = Number(viewport) < 768;

  // Identity comes from the access token's claims, verified LOCALLY against the
  // project JWKS — no auth-server round trip on a page render, and the whole
  // tree shares one resolve per request.
  const { user, authUnavailable } = await getServerAuth();

  // Proxy already handles redirecting unauthenticated users to login
  // This is a safety check in case proxy is bypassed somehow — and it must
  // carry the destination too, or a bypassed proxy silently costs the user
  // their place.
  if (!user) {
    // 🚨 An auth authority we could not REACH is not a signed-out person. The
    // proxy passes these through; so does this layout, or a network blink
    // becomes a logout mid-session.
    if (authUnavailable) {
      console.warn(
        "[(transitional)/layout] identity could not be verified — rendering the retry shell, NOT redirecting to /login.",
      );
      return (
        <div className="p-4 text-sm text-muted-foreground">
          We could not verify who you are on this request, so this page is not
          loading. You have not been signed out — reload in a moment.
          <ErrorAlchemyMenu />
        </div>
      );
    }
    const headersList = await headers();
    const destination = captureAuthDestination(
      headersList.get("x-pathname"),
      headersList.get("x-search-params"),
    );
    return redirect(loginHref(destination));
  }

  // Phase 3: admin check is now a narrow single-row lookup; preferences
  // hydration has moved to the client-side `userPreferencesPolicy` cold-boot
  // path. No preloadedState for userPreferences and no server-side row
  // insert — the first debounced `remote.write` upsert creates the row.
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
    isAdmin: isAdmin,
    serverIsMobile: isMobile,
  };

  const initialReduxState: BaseReduxState = {
    user: userData,
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
