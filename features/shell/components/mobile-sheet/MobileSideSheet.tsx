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

import ShellIcon from "../ShellIcon";
import {
  navItemsForViewer,
  partitionNavChildren,
  primaryNavItems,
  settingsItem,
} from "../../constants/nav-data";
import MobileSheetNavLink from "./MobileSheetNavLink";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";
import AdminMobileMenuItem from "../sidebar/admin-menu/AdminMobileMenuItem";

interface MobileSideSheetProps {
  isAuthenticated: boolean;
}

export default function MobileSideSheet({
  isAuthenticated,
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

          {/* Standard nav — always server-rendered. Groups render the parent
              plus an inline, indented set of children (mobile stacks the tree
              vertically rather than hiding it behind a collapse). */}
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
              // Same standard as desktop: destinations up top, create actions
              // collected at the bottom below a divider. Mobile has no overlay
              // surface, so actions navigate to their graceful `href` fallback.
              const { sections, actions } = partitionNavChildren(item.children);
              return (
                <div
                  key={item.label}
                  className="shell-mobile-nav-group"
                  data-nav-group={item.href}
                >
                  <MobileSheetNavLink
                    href={item.href}
                    iconName={item.iconName}
                    label={item.label}
                  />
                  <div className="shell-mobile-nav-children">
                    {sections.map((section) => (
                      <div key={section.label ?? section.items[0]?.href}>
                        {section.label ? (
                          <div className="shell-mobile-section-label">
                            {section.label}
                          </div>
                        ) : null}
                        {section.items.map((child) => (
                          <MobileSheetNavLink
                            key={child.href}
                            href={child.href}
                            iconName={child.iconName}
                            label={child.label}
                            isChild
                          />
                        ))}
                      </div>
                    ))}
                    {actions.length > 0 ? (
                      <>
                        {sections.length > 0 ? (
                          <div className="shell-mobile-section-divider" />
                        ) : null}
                        {actions.map((child) => (
                          <MobileSheetNavLink
                            key={child.action ?? child.href}
                            href={child.href}
                            iconName={child.iconName}
                            label={child.label}
                            isChild
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {/* Settings */}
            <div className="shell-mobile-section-divider" />
            <MobileSheetNavLink
              href={settingsItem.href}
              iconName={settingsItem.iconName}
              label={settingsItem.label}
            />

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
