// app/(admin)/administration/users/UsersAdminLayoutClient.tsx

"use client";

import React from "react";
import {
  Activity,
  Building2,
  DollarSign,
  Gauge,
  Gift,
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
    label: "Free time & coupons",
    href: "/administration/users/coupons",
    icon: Gift,
  },
  {
    label: "Limits & Knobs",
    href: "/administration/users/limits",
    icon: SlidersHorizontal,
  },
  {
    label: "AI usage limits",
    href: "/administration/users/usage-limits",
    icon: Activity,
  },
  {
    label: "Usage & Cost",
    href: "/administration/usage",
    icon: DollarSign,
  },
  {
    label: "AI spend health",
    href: "/administration/usage/agents",
    icon: Activity,
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
