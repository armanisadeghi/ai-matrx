"use client";

// StaffSidebarMenu — the `/staff` rail, rendered INSIDE the app shell sidebar
// (registered in `route-menu-registry`).
//
// Architecture (load-bearing — modelled on `ChatSidebarMenu`, do not invent a
// parallel structure):
//
//   Every row uses the EXACT `.shell-nav-item shell-tactile-subtle` markup the
//   main app nav's `<NavItem>` uses, via `ROUTE_MENU_NAV_ITEM_CLASS`, and the
//   DOM is IDENTICAL in the collapsed and expanded states. That is the whole
//   point: the collapse animation only toggles `.shell-nav-label` opacity and
//   width, so no icon moves when the rail opens or closes. Aligning back to
//   that class is always the fix; a second styling system here never is.
//
// Only rows that DO something. A person's staff is ONE thread — there is no
// history list to show, no "new staff conversation" to start (a second thread
// is the exact failure the staff-thread design exists to prevent), and no
// picker, because who answers is decided by the mandate's Holder and not by
// the person on this page. So the rail is the thread itself, the box the staff
// works in, and the console where the role is assigned.

import { usePathname } from "next/navigation";
import Link from "next/link";
import { HardDrive, UserRoundCog, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { PERSONAL_STAFF_MANDATE_KEY } from "../mandate";

const STAFF_HREF = "/staff";
const SANDBOX_HREF = "/sandbox";
const MANDATE_CONSOLE_HREF = `/mandates/${PERSONAL_STAFF_MANDATE_KEY}`;

interface StaffSidebarMenuProps {
  expanded: boolean;
}

export default function StaffSidebarMenu({
  expanded: _expanded,
}: StaffSidebarMenuProps) {
  const pathname = usePathname();
  const isStaff = pathname === STAFF_HREF || pathname.startsWith(`${STAFF_HREF}/`);

  return (
    // gap-0.5 matches `.shell-sidebar-main-nav` / `route-nav` so these rows sit
    // at the same rhythm as every other shell nav item.
    <div className="flex flex-1 min-h-0 flex-col gap-0.5">
      <Link
        href={STAFF_HREF}
        title="Your staff"
        aria-label="Your staff"
        aria-current={isStaff ? "page" : undefined}
        className={cn(ROUTE_MENU_NAV_ITEM_CLASS, isStaff && "shell-active-pill")}
      >
        <span className="shell-nav-icon">
          <Users
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label">Your staff</span>
      </Link>

      {/* The box your staff works in. Named here because the thread's sandbox
          note points at it, and a note with no door is a dead end. */}
      <Link
        href={SANDBOX_HREF}
        title="Sandbox"
        aria-label="Sandbox"
        className={ROUTE_MENU_NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <HardDrive
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label">Sandbox</span>
      </Link>

      {/* Where the role is assigned — the same door the `no_holder` refusal
          offers, so it is reachable before anything has gone wrong. */}
      <Link
        href={MANDATE_CONSOLE_HREF}
        title="Who answers"
        aria-label="Who answers"
        className={ROUTE_MENU_NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <UserRoundCog
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label">Who answers</span>
      </Link>
    </div>
  );
}
