// app/(admin)/administration/hr/HrAdminLayoutClient.tsx
//
// Route-tab shell for the HR administration section (SPEC-UI-IA §3.12 routes
// 85 / 85a / 85b). Same shell as the Users & Access hub; the one difference is
// longest-match activation, so `/jurisdiction-rules/verification` lights the
// Verification tab rather than both it and its prefix.

"use client";

import React from "react";
import { ClipboardCheck, Landmark, Scale } from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";

const NAV_ITEMS: AdminSectionTab[] = [
  { label: "Overview", href: "/administration/hr", icon: Landmark },
  {
    label: "Jurisdiction rules",
    href: "/administration/hr/jurisdiction-rules",
    icon: Scale,
  },
  {
    label: "Verification",
    href: "/administration/hr/jurisdiction-rules/verification",
    icon: ClipboardCheck,
  },
];

export function HrAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionShell
      title="HR & Employment Law"
      icon={Scale}
      navLabel="HR administration sections"
      tabs={NAV_ITEMS}
      activeMatch="longest"
    >
      {children}
    </AdminSectionShell>
  );
}
