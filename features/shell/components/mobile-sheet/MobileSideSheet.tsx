// MobileSideSheet — Server component for off-canvas mobile navigation.
//
// Two containers inside the sheet nav:
//   shell-mobile-main-nav  — standard nav (always SSR)
//   shell-mobile-route-nav — route menu (client island, Large Routes)
// data-sidebar-view on .shell-mobile-sheet controls visibility.
//
// All links carry data-nav-href. Active state is driven entirely by CSS:
//   .shell-root[data-pathname^="/demos/ssr/chat"] [data-nav-href="/demos/ssr/chat"] { ... }
//
// NavActiveSync keeps .shell-root[data-pathname] live after client navigation.

import ShellIcon from "../ShellIcon";
import { primaryNavItems, settingsItem } from "../../constants/nav-data";
import MobileSheetNavLink from "./MobileSheetNavLink";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";

export default function MobileSideSheet() {
  return (
    <div className="shell-mobile-sheet-wrapper">
      {/* Backdrop — clicking closes the sheet */}
      <label
        htmlFor="shell-mobile-menu"
        className="shell-mobile-sheet-backdrop"
        aria-label="Close navigation menu"
      />

      {/* Sheet panel */}
      <div
        className="shell-mobile-sheet matrx-glass-thin-border"
        data-sidebar-view="main"
      >
        {/* Close button — absolutely positioned relative to the sheet */}
        <label
          htmlFor="shell-mobile-menu"
          className="shell-mobile-sheet-close"
          aria-label="Close navigation menu"
        >
          <ShellIcon name="X" size={18} strokeWidth={2} />
        </label>

        {/* Brand — wordmark only (no logo icon). */}
        <div className="shell-mobile-sheet-brand">
          <span className="shell-mobile-sheet-brand-text">MATRX</span>
        </div>

        {/* Navigation with dual-view support */}
        <nav aria-label="Mobile navigation">
          {/* Route menu switch + content — client island */}
          <MobileRouteMenuSlot />

          {/* Standard nav — always server-rendered */}
          <div className="shell-mobile-main-nav">
            {primaryNavItems.map((item) => (
              <MobileSheetNavLink
                key={item.href}
                href={item.href}
                iconName={item.iconName}
                label={item.label}
              />
            ))}

            {/* Settings */}
            <div className="shell-mobile-section-divider" />
            <MobileSheetNavLink
              href={settingsItem.href}
              iconName={settingsItem.iconName}
              label={settingsItem.label}
            />

            {/* Admin section — injected by AdminNavInjector (client component) */}
            <div id="admin-nav-mobile-slot" />
          </div>

          {/* Route menu — populated by MobileRouteMenuSlot client island */}
          <div className="shell-mobile-route-nav" />
        </nav>
      </div>
    </div>
  );
}
