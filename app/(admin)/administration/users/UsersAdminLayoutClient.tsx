// app/(admin)/administration/users/UsersAdminLayoutClient.tsx

"use client";

import React from "react";
import {
  Building2,
  DollarSign,
  Gauge,
  Mail,
  MailPlus,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UserPlus,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";

const NAV_ITEMS: AdminSectionTab[] = [
  {
    label: "Accounts",
    href: "/administration/users",
    icon: Users,
    exact: true,
  },
  {
    label: "Organizations",
    href: "/administration/users/organizations",
    icon: Building2,
  },
  {
    label: "User Acquisition",
    href: "/administration/users/acquisition",
    icon: UserPlus,
  },
  {
    label: "Preferences",
    href: "/administration/users/preferences",
    icon: SlidersHorizontal,
  },
  {
    label: "Admins & Levels",
    href: "/administration/users/admins",
    icon: ShieldCheck,
  },
  {
    label: "Invitations",
    href: "/administration/users/invitations",
    icon: MailPlus,
  },
  {
    label: "Entitlements",
    href: "/administration/users/entitlements",
    icon: Gauge,
  },
  {
    label: "Limits & Knobs",
    href: "/administration/users/limits",
    icon: SlidersHorizontal,
  },
  {
    label: "Usage & Cost",
    href: "/administration/users/usage",
    icon: DollarSign,
  },
  {
    label: "Email",
    href: "/administration/users/email",
    icon: Mail,
  },
  {
    label: "Announcements",
    href: "/administration/users/announcements",
    icon: Megaphone,
  },
];

export function UsersAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionShell
      title="Users & Access"
      icon={Users}
      navLabel="Users and access sections"
      tabs={NAV_ITEMS}
    >
      {children}
    </AdminSectionShell>
  );
}
