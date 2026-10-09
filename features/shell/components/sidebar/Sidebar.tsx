// Sidebar.tsx — Server component for desktop sidebar
// Three sections: Brand (top), Nav (middle, scrollable), Footer (bottom)
// Content-push expansion driven by the #shell-sidebar-toggle checkbox through
// sibling combinators, and the grid via a child-only .shell-root:has(> toggle) (shell.css)
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
import { initialSidebarView } from "./sidebar-initial-view";
import { ADMIN_FOOTER_PREPAINT_SCRIPT } from "./admin-menu/admin-footer-reserve";

interface SidebarProps {
  pathname: string;
  isAuthenticated: boolean;
}

export default function Sidebar({ pathname, isAuthenticated }: SidebarProps) {
  const initialView = initialSidebarView(pathname);
  const visibleItems = navItemsForViewer(primaryNavItems, isAuthenticated);
  const activeCandidates = [...visibleItems, settingsItem];
  return (
    // `data-title-side="right"`: every `title` in the rail shows as the fleet
    // tooltip (the design-system title takeover), opening beside the rail —
    // it only appears while the label is hidden (collapsed rail).
    <aside className="shell-sidebar" data-title-side="right">
      {/* Brand Section — Route header override + default toggle fallback */}
      <div className="shell-sidebar-brand">
        {/* Route header override — rendered by client island, empty on Small/Medium routes */}
        <div className="shell-sidebar-brand-route">
          <RouteHeaderSlot />
        </div>

        {/* Default: collapse toggle — hidden when route header is active */}
        <div className="shell-sidebar-brand-default">
          <label
            htmlFor="shell-sidebar-toggle"
            className="shell-sidebar-brand-toggle shell-sidebar-brand-toggle-control shell-tactile"
            aria-label="Toggle sidebar"
          >
            <ShellIcon name="PanelLeft" size={18} strokeWidth={1.75} />
          </label>
        </div>
      </div>

      {/* Navigation — Self-scrolling container with dual-view support */}
      <nav
        className="shell-sidebar-nav"
        aria-label="Main navigation"
        data-sidebar-view={initialView}
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
              <NavFlyoutGroup
                key={item.label}
                item={item}
                candidates={activeCandidates}
              />
            ) : (
              <NavItem key={item.label} item={item} />
            ),
          )}
        </div>

        {/* Route menu — populated by RouteMenuSlot client island */}
        <div className="shell-sidebar-route-nav">
          {initialView === "route" ? (
            <div className="shell-sidebar-route-loading shell-route-ssr-skeleton" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shell-sidebar-route-loading-item" />
              ))}
            </div>
          ) : null}
        </div>
      </nav>

      {/* Footer — admin section + Windows. Lives OUTSIDE the nav so it is never
          hidden by the route-menu view switch (e.g. on /chat). Settings is the
          account rail's first slot (ShellUserBlock), below this column. */}
      {/* Reserves the admin block's last measured height before first paint, so the footer
          does not grow (and shift) when admin status resolves — admin-footer-reserve.ts. */}
      <script dangerouslySetInnerHTML={{ __html: ADMIN_FOOTER_PREPAINT_SCRIPT }} />
      <div className="shell-sidebar-footer">
        <AdminSidebarSection />
        <SidebarWindowToggleIsland />
      </div>
    </aside>
  );
}
