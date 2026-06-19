// NavItem — Pure Server Component. No client JS, no hooks.
//
// Active state is determined by Sidebar.tsx on the server using the pathname
// from request headers. At runtime, CSS reads .shell-root[data-pathname]
// (kept live by NavActiveSync) to maintain correct state after client navigation.
//
// Each link gets data-nav-href so CSS can style it:
//   .shell-root[data-pathname^="/demos/ssr/chat"] [data-nav-href="/demos/ssr/chat"] { ... }

import Link from "next/link";
import ShellIcon from "../ShellIcon";
import type { ShellNavItem } from "../../constants/nav-data";

interface NavItemProps {
  item: ShellNavItem;
}

export default function NavItem({ item }: NavItemProps) {
  if (item.external) {
    return (
      <a
        href={item.href}
        title={item.label}
        target="_blank"
        rel="noopener noreferrer"
        className="shell-nav-item shell-tactile-subtle"
      >
        <span className="shell-nav-icon">
          <ShellIcon name={item.iconName} size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label">{item.label}</span>
        <span className="shell-nav-external">
          <ShellIcon name="ArrowUpRight" size={14} strokeWidth={1.75} />
        </span>
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.label}
      data-nav-href={item.href}
      className="shell-nav-item shell-tactile-subtle"
    >
      <span className="shell-nav-icon">
        <ShellIcon name={item.iconName} size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">{item.label}</span>
    </Link>
  );
}
