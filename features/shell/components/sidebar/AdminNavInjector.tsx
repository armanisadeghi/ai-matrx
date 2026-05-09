"use client";

// AdminNavInjector — Client component that injects admin nav items
// into the sidebar and mobile side sheet after Redux hydration reveals admin status.
// Uses portals to render into slots placed by the server-rendered Sidebar/MobileSideSheet.

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import Link from "next/link";
import ShellIcon from "../ShellIcon";
import { adminNavItems } from "../../constants/nav-data";
import MobileSheetNavLink from "../mobile-sheet/MobileSheetNavLink";

function AdminSidebarItems() {
  return (
    <>
      <div
        style={{
          height: 1,
          background: "var(--matrx-glass-border-color)",
          margin: "0.5rem 0.25rem",
        }}
      />
      {adminNavItems.map((item) => (
        <Link
          key={item.href}
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
      ))}
    </>
  );
}

function AdminMobileItems() {
  return (
    <>
      <div className="shell-mobile-section-divider" />
      <div className="shell-mobile-section-label">Admin</div>
      {adminNavItems.map((item) => (
        <MobileSheetNavLink
          key={item.href}
          href={item.href}
          iconName={item.iconName}
          label={item.label}
        />
      ))}
    </>
  );
}

export default function AdminNavInjector() {
  const isAdmin = useAppSelector((state) => state.userAuth.isAdmin);
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setSidebarSlot(document.getElementById("admin-nav-slot"));
    setMobileSlot(document.getElementById("admin-nav-mobile-slot"));
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <>
      {sidebarSlot && createPortal(<AdminSidebarItems />, sidebarSlot)}
      {mobileSlot && createPortal(<AdminMobileItems />, mobileSlot)}
    </>
  );
}
