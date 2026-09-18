"use client";

import AppLink from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import ShellIcon from "../ShellIcon";
import { isOnRoute } from "@/features/shell/utils/is-nav-group-active";

interface MobileSheetNavLinkProps {
  href: string;
  iconName: ShellIconName;
  label: string;
  /** Render as an indented child of a nav group (smaller icon, inset). */
  isChild?: boolean;
  /** Separately-hosted app on its own origin — open in a new tab. */
  external?: boolean;
  /** Internal destination that should preserve the current workspace tab. */
  openInNewTab?: boolean;
  /** Optional parent label shown under a search result. */
  contextLabel?: string;
  /** Match only this route, not its descendants. */
  exact?: boolean;
  /** Canonical route ownership resolved by the parent menu. */
  active?: boolean;
}

export default function MobileSheetNavLink({
  href,
  iconName,
  label,
  isChild = false,
  external = false,
  openInNewTab = false,
  contextLabel,
  exact = false,
  active,
}: MobileSheetNavLinkProps) {
  const pathname = usePathname();
  const isActive =
    !external &&
    !openInNewTab &&
    (active ?? isOnRoute(pathname ?? "", href, exact));
  const className = isChild
    ? "shell-mobile-nav-item shell-mobile-nav-child"
    : "shell-mobile-nav-item";
  const closeAfterNavigationStarts = () => {
    window.setTimeout(closeShellMobileMenu, 0);
  };

  if (external || openInNewTab) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={closeAfterNavigationStarts}
      >
        <span className="shell-nav-icon">
          <ShellIcon
            name={iconName}
            size={isChild ? 18 : 20}
            strokeWidth={1.75}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {contextLabel ? (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {contextLabel}
            </span>
          ) : null}
        </span>
        <span className="shell-nav-external">
          <ShellIcon name="ArrowUpRight" size={14} strokeWidth={1.75} />
        </span>
      </a>
    );
  }

  return (
    <AppLink
      href={href}
      data-nav-href={href}
      data-active={isActive ? "true" : undefined}
      aria-current={isActive ? "page" : undefined}
      className={className}
      onClick={closeAfterNavigationStarts}
    >
      <span className="shell-nav-icon">
        <ShellIcon
          name={iconName}
          size={isChild ? 18 : 20}
          strokeWidth={1.75}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {contextLabel ? (
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {contextLabel}
          </span>
        ) : null}
      </span>
    </AppLink>
  );
}
