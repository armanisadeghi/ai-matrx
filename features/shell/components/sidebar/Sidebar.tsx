// Sidebar.tsx — Server component for desktop sidebar
// Three sections: Brand (top), Nav (middle, scrollable), Footer (bottom)
// Content-push expansion driven by CSS :has(#shell-sidebar-toggle:checked)
//
// Brand section has two layers:
//   Default: collapse toggle (PanelLeft icon)
//   Route override: RouteHeaderSlot (back, agent dropdown, new-run, etc.)
//   When the route header is active, it hides the default toggle via CSS.
//
// Nav section has two containers:
//   shell-sidebar-main-nav  — standard nav items (always SSR, always in DOM)
//   shell-sidebar-route-nav — route-specific menu (client island, Large Routes)
// data-sidebar-view on <nav> controls which is visible (default: "main").

import NavItem from "./NavItem";
import NavFlyoutGroup from "./NavFlyoutGroup";
import FavoritesNavGroup from "./FavoritesNavGroup";
import Link from "next/link";
import AdminSidebarSection from "./admin-menu/AdminSidebarSection";
import RouteMenuSlot from "./RouteMenuSlot";
import RouteHeaderSlot from "./RouteHeaderSlot";
import ShellIcon from "../ShellIcon";
import SidebarWindowToggleIsland from "./SidebarWindowToggleIsland";
import {
  navItemsForViewer,
  primaryNavItems,
  settingsItem,
} from "../../constants/nav-data";
import { SETTINGS_BASE } from "@/features/settings/route-shell/routing";
import { isUserSettingsPath } from "@/features/settings/route-shell/settings-route-path";

interface SidebarProps {
  pathname: string;
  isAuthenticated: boolean;
}

export default function Sidebar({ pathname, isAuthenticated }: SidebarProps) {
  const visibleItems = navItemsForViewer(primaryNavItems, isAuthenticated);
  const settingsRoute = isUserSettingsPath(pathname);
  return (
    <aside className="shell-sidebar">
      {/* Brand Section — Route header override + default toggle fallback */}
      <div className="shell-sidebar-brand">
        {/* Route header override — rendered by client island, empty on Small/Medium routes */}
        <div className="shell-sidebar-brand-route">
          <RouteHeaderSlot />
        </div>

        {/* Default: collapse toggle — hidden when route header is active */}
        <div className="shell-sidebar-brand-default">
          {settingsRoute ? (
            <Link
              href={SETTINGS_BASE}
              className="shell-sidebar-settings-home shell-tactile"
              aria-current="page"
              title="Settings"
            >
              <span className="shell-sidebar-brand-toggle shell-sidebar-brand-toggle-static">
                <ShellIcon name="PanelLeft" size={18} strokeWidth={1.75} />
              </span>
              <span className="shell-sidebar-brand-logo">Settings</span>
            </Link>
          ) : (
            <label
              htmlFor="shell-sidebar-toggle"
              className="shell-sidebar-brand-toggle shell-tactile"
              aria-label="Toggle sidebar"
            >
              <ShellIcon name="PanelLeft" size={18} strokeWidth={1.75} />
            </label>
          )}
        </div>
      </div>

      {/* Navigation — Self-scrolling container with dual-view support */}
      <nav
        className="shell-sidebar-nav"
        aria-label="Main navigation"
        data-sidebar-view="main"
      >
        {/* Route menu switch + content — client island, renders nothing on Small/Medium routes */}
        <RouteMenuSlot />

        {/* Standard nav — always server-rendered */}
        <div className="shell-sidebar-main-nav">
          {/* Favorites — client island; reads pins from Redux (no fetch). Authed
              users only (favorites are per-user). */}
          {isAuthenticated && <FavoritesNavGroup />}
          {visibleItems.map((item) =>
            item.children ? (
              <NavFlyoutGroup key={item.label} item={item} />
            ) : (
              <NavItem key={item.label} item={item} />
            ),
          )}
        </div>

        {/* Route menu — populated by RouteMenuSlot client island */}
        <div className="shell-sidebar-route-nav" />
      </nav>

      {/* Footer — admin section + Windows + Settings. Lives OUTSIDE the nav so it
          is never hidden by the route-menu view switch (e.g. on /chat). */}
      <div className="shell-sidebar-footer">
        <AdminSidebarSection />
        <SidebarWindowToggleIsland />
        {settingsItem.children ? (
          <NavFlyoutGroup item={settingsItem} />
        ) : (
          <NavItem item={settingsItem} />
        )}
      </div>
    </aside>
  );
}
