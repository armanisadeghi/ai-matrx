// MobileDockItems — Pure Server Component. No "use client", no hooks, no props.
//
// Renders dock links with data-nav-href on each one.
// CSS in shell.css reads .shell-root[data-pathname] to determine which
// data-nav-href matches — zero client JS, zero prop drilling.
//
// Export MobileDockItem so custom route docks can reuse the same link shape.

import Link from "next/link";
import ShellIcon from "../ShellIcon";
import { dockItems, navItemsForViewer } from "../../constants/nav-data";
import type { ShellNavItem } from "../../constants/nav-data";

/** Single dock link — reusable by custom route docks. */
export function MobileDockItem({ item }: { item: ShellNavItem }) {
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="shell-dock-item"
        aria-label={item.label}
      >
        <ShellIcon name={item.iconName} size={22} strokeWidth={1.75} />
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      data-nav-href={item.href}
      className="shell-dock-item"
      aria-label={item.label}
    >
      <ShellIcon name={item.iconName} size={22} strokeWidth={1.75} />
    </Link>
  );
}

/** Default shell dock — all nav items with a dockOrder in nav-data. */
export default function MobileDockItems({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const items = navItemsForViewer(dockItems, isAuthenticated);
  return (
    <>
      {items.map((item) => (
        <MobileDockItem key={item.href} item={item} />
      ))}
    </>
  );
}
