"use client";

// FavoritesNavGroup — the sidebar's "Favorites" entry, the second half of the
// pin's dual purpose: anything pinned on the dashboard shows up here too.
//
// The KEY performance property the user asked for: the Favorites entry costs
// nothing to put in the menu, and opening it triggers NO query. Favorites live
// in the user_preferences JSON, which is already hydrated into Redux at boot —
// so this island reads them straight from the store and the flyout panel only
// renders its contents when hovered/clicked (NavFlyoutGroup defers the panel).
// Route loading is never blocked because there is no fetch anywhere in here.
//
// SSR / first client render: favorites are [] (preferences hydrate post-paint),
// so we render the plain "Favorites → /dashboard" link — identical on server and
// client (no hydration mismatch). Once preferences rehydrate, the flyout
// version takes over.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectFavoriteItems } from "@/lib/redux/preferences/userPreferenceSelectors";
import NavFlyoutGroup from "./NavFlyoutGroup";
import NavItem from "./NavItem";
import type { ShellNavChild, ShellNavItem } from "../../constants/nav-data";

const FAVORITES_HREF = "/dashboard"; // hub that hosts the full "Pinned" grid

export default function FavoritesNavGroup() {
  const favorites = useAppSelector(selectFavoriteItems);

  // Empty → plain link to the dashboard (where the user can pin things).
  if (favorites.length === 0) {
    const item: ShellNavItem = {
      label: "Favorites",
      href: FAVORITES_HREF,
      iconName: "Star",
      section: "primary",
    };
    return <NavItem item={item} />;
  }

  const children: ShellNavChild[] = favorites.map((f) => ({
    label: f.label,
    href: f.href,
    iconName: f.iconName ?? "Star",
    external: f.href.startsWith("http"),
  }));

  const item: ShellNavItem = {
    label: "Favorites",
    href: FAVORITES_HREF,
    iconName: "Star",
    section: "primary",
    children,
  };

  return <NavFlyoutGroup item={item} />;
}
