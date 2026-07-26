// app/(admin)/administration/users/layout.tsx
//
// Users & Access hub — route-tabbed shell consolidating every user/admin
// management surface: accounts, organizations and memberships, preferences
// health, admin privileges, invitations, entitlements, per-user usage & cost,
// and email. Each tab is its
// own route; this layout owns the viewport height and the tab bar (the
// relationships / scheduling-admin hub pattern). Super-admin gating is
// inherited from app/(admin)/layout.tsx — not re-done here.

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { UsersAdminLayoutClient } from "./UsersAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Users & Access",
  description:
    "Accounts, organizations, memberships, preferences, admin privileges, invitations, entitlements, usage, and email",
  letter: "US",
});

export default function UsersAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UsersAdminLayoutClient>{children}</UsersAdminLayoutClient>;
}
