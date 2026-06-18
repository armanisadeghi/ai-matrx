"use client";

// AdminSidebarSection — the admin-only block at the end of the desktop main nav.
//
// Renders ONLY for admins (any tier) via `selectIsAdmin`. Wrapped in top + bottom
// borders so it reads as a distinct section; new admin chrome can be dropped in
// here. Contains:
//   - Administration (the lazy 3-layer cascade; catalog never loads for non-admins)
//   - Debug indicator toggle (self-gates to super-admin)
//   - Localhost / Production server toggle (self-gates to admin)

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import SidebarAdminIndicatorToggle from "../../controls/SidebarAdminIndicatorToggle";
import SidebarEnvToggle from "../../controls/SidebarEnvToggle";

const AdminMenu = dynamic(() => import("./AdminMenu"), {
  ssr: false,
  loading: () => null,
});

export default function AdminSidebarSection() {
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;

  // Defer the gate to post-hydration: admin status comes from Redux which
  // hydrates client-side, so server and first client render both show nothing.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isAdmin) return null;

  return (
    <div className="shell-admin-section">
      <AdminMenu />
      <SidebarAdminIndicatorToggle />
      <SidebarEnvToggle />
    </div>
  );
}
