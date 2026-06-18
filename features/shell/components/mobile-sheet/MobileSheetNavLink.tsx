"use client";

import Link from "next/link";
import ShellIcon from "../ShellIcon";

interface MobileSheetNavLinkProps {
  href: string;
  iconName: string;
  label: string;
  /** Render as an indented child of a nav group (smaller icon, inset). */
  isChild?: boolean;
}

export default function MobileSheetNavLink({
  href,
  iconName,
  label,
  isChild = false,
}: MobileSheetNavLinkProps) {
  function closeSheet() {
    const checkbox = document.getElementById(
      "shell-mobile-menu",
    ) as HTMLInputElement | null;
    if (checkbox) checkbox.checked = false;
  }

  return (
    <Link
      href={href}
      data-nav-href={href}
      className={
        isChild
          ? "shell-mobile-nav-item shell-mobile-nav-child"
          : "shell-mobile-nav-item"
      }
      onClick={closeSheet}
    >
      <span className="shell-nav-icon">
        <ShellIcon
          name={iconName}
          size={isChild ? 18 : 20}
          strokeWidth={1.75}
        />
      </span>
      <span>{label}</span>
    </Link>
  );
}
