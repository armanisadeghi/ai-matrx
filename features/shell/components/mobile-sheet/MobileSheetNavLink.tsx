"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import ShellIcon from "../ShellIcon";

interface MobileSheetNavLinkProps {
  href: string;
  iconName: string;
  label: string;
  /** Render as an indented child of a nav group (smaller icon, inset). */
  isChild?: boolean;
  /** Separately-hosted app on its own origin — open in a new tab. */
  external?: boolean;
  /** Internal destination that should preserve the current workspace tab. */
  openInNewTab?: boolean;
  /** Optional parent label shown under a search result. */
  contextLabel?: string;
}

export default function MobileSheetNavLink({
  href,
  iconName,
  label,
  isChild = false,
  external = false,
  openInNewTab = false,
  contextLabel,
}: MobileSheetNavLinkProps) {
  const pathname = usePathname();
  const isActive =
    !external &&
    !openInNewTab &&
    (pathname === href ||
      (href !== "/" && pathname?.startsWith(`${href}/`) === true));
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
    <Link
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
    </Link>
  );
}
