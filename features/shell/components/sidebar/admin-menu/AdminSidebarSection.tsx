"use client";

// AdminSidebarSection — the admin-only block in the desktop sidebar footer.
//
// Lives in the footer (outside the route-flipping nav) so it stays visible on
// every route, including ones with a route-specific menu (e.g. /chat).
//
// Renders ONLY for admins (any tier) via `selectIsAdmin`. Wrapped in top + bottom
// borders so it reads as a distinct section; new admin chrome can be dropped in
// here. Contains:
//   - Admin Launchpad (prominent new-tab door that preserves the current work)
//   - Administration (the lazy 3-layer cascade; catalog never loads for non-admins)
//   - Creator Hub toggle (window panel; self-gates to creators)
//   - Debug indicator toggle (self-gates to super-admin)
//   - Localhost / Production server toggle (self-gates to admin)
//   - AI runtime v1 / v2 API-version toggle (self-gates to admin)

import dynamic from "next/dynamic";
import Link from "next/link";
import { ADMIN_LAUNCHPAD_PATH } from "@/features/admin/constants/admin-categories";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import SidebarAdminIndicatorToggle from "../../controls/SidebarAdminIndicatorToggle";
import SidebarApiVersionToggle from "../../controls/SidebarApiVersionToggle";
import SidebarCreatorHubToggle from "../../controls/SidebarCreatorHubToggle";
import SidebarEnvToggle from "../../controls/SidebarEnvToggle";
import SidebarErrorInspectorToggle from "../../controls/SidebarErrorInspectorToggle";
import ShellIcon from "../../ShellIcon";

const AdminMenu = dynamic(() => import("./AdminMenu"), {
  ssr: false,
  loading: () => null,
});

export default function AdminSidebarSection() {
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;
  const hydrated = useIsMounted();

  if (!hydrated || !isAdmin) return null;

  return (
    <div className="shell-admin-section">
      <Link
        href={ADMIN_LAUNCHPAD_PATH}
        target="_blank"
        rel="noopener noreferrer"
        title="Admin Launchpad"
        className="shell-nav-item shell-tactile-subtle border border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
      >
        <span className="shell-nav-icon">
          <ShellIcon name="LayoutGrid" size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label">Admin Launchpad</span>
        <span className="shell-nav-external">
          <ShellIcon name="ArrowUpRight" size={14} strokeWidth={1.75} />
        </span>
      </Link>
      <AdminMenu />
      <SidebarErrorInspectorToggle />
      <SidebarCreatorHubToggle />
      <SidebarAdminIndicatorToggle />
      <SidebarEnvToggle />
      <SidebarApiVersionToggle />
    </div>
  );
}
