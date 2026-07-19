// MobileSideSheet — Server component for off-canvas mobile navigation.
//
// Two containers inside the sheet nav:
//   shell-mobile-main-nav  — standard nav (always SSR)
//   shell-mobile-route-nav — route menu (client island, Large Routes)
// data-sidebar-view on .shell-mobile-sheet controls visibility.
//
// All links carry data-nav-href. Active state is driven entirely by CSS:
//   .shell-root[data-pathname^="/demos/chat"] [data-nav-href="/demos/chat"] { ... }
//
// NavActiveSync keeps .shell-root[data-pathname] live after client navigation.

import {
  navItemsForViewer,
  primaryNavItems,
  settingsItem,
} from "../../constants/nav-data";
import MobileSheetNavLink from "./MobileSheetNavLink";
import MobileNavGroup from "./MobileNavGroup";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";
import MobileSheetHamburgerToggle from "./MobileSheetHamburgerToggle";
import AdminMobileMenuItem from "../sidebar/admin-menu/AdminMobileMenuItem";

interface MobileSideSheetProps {
  isAuthenticated: boolean;
  /** SSR pathname — drives which nav group starts expanded. */
  pathname: string;
}

export default function MobileSideSheet({
  isAuthenticated,
  pathname,
}: MobileSideSheetProps) {
  const visibleItems = navItemsForViewer(primaryNavItems, isAuthenticated);
  return (
    <div className="shell-mobile-sheet-wrapper">
      {/* Backdrop — clicking closes the sheet */}
      <label
        htmlFor="shell-mobile-menu"
        className="shell-mobile-sheet-backdrop"
        aria-label="Close navigation menu"
      />

      {/* Duplicate header hamburger — same screen position for open/close */}
      <MobileSheetHamburgerToggle />

      {/* Sheet panel */}
      <div
        className="shell-mobile-sheet matrx-glass-thin-border"
        data-sidebar-view="main"
      >
        {/* Brand — wordmark only (no logo icon). */}
        <div className="shell-mobile-sheet-brand">
          <span className="shell-mobile-sheet-brand-text">MATRX</span>
        </div>

        {/* Navigation with dual-view support */}
        <nav aria-label="Mobile navigation">
          {/* Route menu switch + content — client island */}
          <MobileRouteMenuSlot />

          {/* Standard nav — groups collapse by default; only the active route's
              group starts expanded (see MobileNavGroup). */}
          <div className="shell-mobile-main-nav">
            {visibleItems.map((item) => {
              if (!item.children || item.children.length === 0) {
                return (
                  <MobileSheetNavLink
                    key={item.label}
                    href={item.href}
                    iconName={item.iconName}
                    label={item.label}
                    external={item.external}
                  />
                );
              }
              return (
                <MobileNavGroup
                  key={item.label}
                  item={item}
                  initialPathname={pathname}
                />
              );
            })}

            {/* Settings */}
            <div className="shell-mobile-section-divider" />
            {settingsItem.children && settingsItem.children.length > 0 ? (
              <MobileNavGroup item={settingsItem} initialPathname={pathname} />
            ) : (
              <MobileSheetNavLink
                href={settingsItem.href}
                iconName={settingsItem.iconName}
                label={settingsItem.label}
              />
            )}

            {/* Admin section — single "Administration" entry, self-gated by
                selectIsAdmin (client component) */}
            <AdminMobileMenuItem />
          </div>

          {/* Route menu — populated by MobileRouteMenuSlot client island */}
          <div className="shell-mobile-route-nav" />
        </nav>
      </div>
    </div>
  );
}
