// AppShell — the canonical modern application shell (sidebar + header + islands).
//
// Single source of truth for the chrome that wraps authenticated routes. Used by
// BOTH `app/(core)/layout.tsx` and `app/(admin)/layout.tsx` so the core app and
// the admin tree share one shell — no second "admin layout" to drift.
//
// The caller (each route-group layout) owns auth, the super-admin gate, and
// building `initialReduxState` / `userData`; it then hands the resolved values
// here. This component owns only the shell structure.
//
// Server Component: `Providers` is the single client boundary; Sidebar/Header
// are server-rendered and stream through it.

import "@/styles/shell.css";
import "@/features/shell/components/header/variants/header-variants.css";
import { Providers } from "@/app/Providers";
import Sidebar from "@/features/shell/components/sidebar/Sidebar";
import Header from "@/features/shell/components/header/Header";
import MobileDock from "@/features/shell/components/dock/MobileDock";
import MobileSideSheet from "@/features/shell/components/mobile-sheet/MobileSideSheet";
import GlassPortal from "@/features/shell/components/GlassPortal";
import NavActiveSync from "@/features/shell/components/NavActiveSync";
import MobileMenuPathSync from "@/features/shell/components/MobileMenuPathSync";
import VisualViewportSync from "@/features/shell/components/VisualViewportSync";
import ShellSidebarCookieSync from "@/features/shell/components/ShellSidebarCookieSync";
import DeferredIslands from "@/features/shell/islands/DeferredIslands";
import type { UserData } from "@/utils/userDataMapper";
import type { BaseReduxState } from "@/types/reduxTypes";

interface AppShellProps {
  children: React.ReactNode;
  /** Preloaded Redux bootstrap state (user + optional SSR caches). */
  initialReduxState: BaseReduxState;
  /** Resolved user (real user or mapped guest). Drives the header user menu. */
  userData: UserData;
  isAuthenticated: boolean;
  /** SSR pathname (`x-pathname` header) — stamped on `.shell-root` for the
   *  CSS-driven active-nav system. */
  pathname: string;
  /** Sidebar expanded/collapsed, read from the persisted cookie at SSR. */
  sidebarExpanded: boolean;
}

export default function AppShell({
  children,
  initialReduxState,
  userData,
  isAuthenticated,
  pathname,
  sidebarExpanded,
}: AppShellProps) {
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
      <MobileMenuPathSync />
      <VisualViewportSync />
      <ShellSidebarCookieSync />
      {/* Active-organization hydration is owned by the sync engine
          (`appContextPolicy`, registered in lib/sync/registry) — it rehydrates
          the org from cache before first paint and reconciles via remote.fetch.
          The old <ActiveOrgBootstrap /> island was retired in favor of it. */}
      <DeferredIslands />
    </Providers>
  );
}
