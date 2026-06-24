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
import type { ShellNavChild, ShellNavItem } from "../../constants/nav-data";

const FAVORITES_HREF = "/dashboard"; // hub that hosts the full "Pinned" grid

// Always the last entry — `partitionNavChildren` collects it into the actions
// section at the bottom of the flyout. Opens the Manage Favorites window so the
// user can edit their pins straight from this menu (handler in navActions.ts).
const MANAGE_CHILD: ShellNavChild = {
  label: "Manage favorites",
  href: FAVORITES_HREF,
  iconName: "SlidersHorizontal",
  action: "manage-favorites",
};

export default function FavoritesNavGroup() {
  const favorites = useAppSelector(selectFavoriteItems);

  const children: ShellNavChild[] = favorites.map((f) => ({
    label: f.label,
    href: f.href,
    iconName: f.iconName ?? "Star",
    external: f.href.startsWith("http"),
  }));
  // "Manage favorites" is always available — even with zero pins, so the user
  // can open the picker and add their first ones from here.
  children.push(MANAGE_CHILD);

  const item: ShellNavItem = {
    label: "Favorites",
    href: FAVORITES_HREF,
    iconName: "Star",
    section: "primary",
    children,
  };

  // Favorites is a launcher, not a route — never show it as the active item
  // (its pins duplicate other nav entries that already highlight).
  return <NavFlyoutGroup item={item} suppressActive />;
}
