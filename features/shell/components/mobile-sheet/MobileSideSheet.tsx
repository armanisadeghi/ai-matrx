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
import MobileNavigationDrawer from "./MobileNavigationDrawer";

interface MobileSideSheetProps {
  isAuthenticated: boolean;
  /** SSR pathname — drives which nav group starts expanded. */
  pathname: string;
}

export default function MobileSideSheet({
  isAuthenticated,
  pathname: _pathname,
}: MobileSideSheetProps) {
  const visibleItems = navItemsForViewer(primaryNavItems, isAuthenticated);
  return (
    <MobileNavigationDrawer items={visibleItems} settingsItem={settingsItem} />
  );
}
