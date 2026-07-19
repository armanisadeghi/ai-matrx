"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_WINDOW_PANEL_ICON,
  partitionNavChildren,
  type ShellNavItem,
} from "../../constants/nav-data";
import { isMobileNavGroupActive } from "../../utils/is-nav-group-active";
import { closeShellMobileMenu } from "../../utils/closeShellMobileMenu";
import MobileSheetNavLink from "./MobileSheetNavLink";
import ShellIcon from "../ShellIcon";

interface MobileNavGroupProps {
  item: ShellNavItem;
  /** SSR pathname for the first paint before `usePathname` hydrates. */
  initialPathname: string;
}

export default function MobileNavGroup({
  item,
  initialPathname,
}: MobileNavGroupProps) {
  const pathname = usePathname() ?? initialPathname;
  const routeActive = isMobileNavGroupActive(pathname, item);
  const [open, setOpen] = useState(routeActive);

  useEffect(() => {
    setOpen(routeActive);
  }, [routeActive]);

  const { sections, panels, actions } = partitionNavChildren(
    item.children ?? [],
  );

  return (
    <details
      className="shell-mobile-nav-group"
      data-nav-group={item.href}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="shell-mobile-nav-item list-none [&::-webkit-details-marker]:hidden">
        {item.external ? (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center gap-3"
            onClick={(event) => {
              event.stopPropagation();
              closeShellMobileMenu();
            }}
          >
            <span className="shell-nav-icon">
              <ShellIcon name={item.iconName} size={20} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </a>
        ) : (
          <Link
            href={item.href}
            data-nav-href={item.href}
            className="flex min-w-0 flex-1 items-center gap-3"
            onClick={(event) => {
              event.stopPropagation();
              closeShellMobileMenu();
            }}
          >
            <span className="shell-nav-icon">
              <ShellIcon name={item.iconName} size={20} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        )}
        <ShellIcon
          name="ChevronDown"
          size={16}
          strokeWidth={1.75}
          className="shell-mobile-nav-caret ml-1 shrink-0 text-muted-foreground transition-transform"
        />
      </summary>

      <div className="shell-mobile-nav-children">
        {sections.map((section) => (
          <div key={section.label ?? section.items[0]?.href}>
            {section.label ? (
              <div className="shell-mobile-section-label">{section.label}</div>
            ) : null}
            {section.items.map((child) => (
              <MobileSheetNavLink
                key={child.href}
                href={child.href}
                iconName={child.iconName}
                label={child.label}
                isChild
                external={child.external}
              />
            ))}
          </div>
        ))}
        {panels.length > 0 ? (
          <>
            {sections.length > 0 ? (
              <div className="shell-mobile-section-divider" />
            ) : null}
            {panels.map((child) => (
              <MobileSheetNavLink
                key={child.panelAction ?? child.href}
                href={child.href}
                iconName={NAV_WINDOW_PANEL_ICON}
                label={child.label}
                isChild
              />
            ))}
          </>
        ) : null}
        {actions.length > 0 ? (
          <>
            {sections.length > 0 || panels.length > 0 ? (
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
    </details>
  );
}
