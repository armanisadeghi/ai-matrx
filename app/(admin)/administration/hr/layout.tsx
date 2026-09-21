// app/(admin)/administration/hr/layout.tsx
//
// HR & Employment Law hub — the admin-portal home of the platform's
// jurisdiction rule library (SPEC-UI-IA §3.12 routes 85 / 85a / 85b).
//
// D25 (2026-08-28): "Only a superadmin and from the admin portal" may promote a
// rule to active. The (admin) layout admits any admin; superadmin is enforced
// at the DATABASE (hr.jurisdiction_rule_set_status + the authority-gate
// trigger), and every page here renders the refusal envelope in place.

import React from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

import { HrAdminLayoutClient } from "./HrAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "HR & Employment Law",
  description:
    "The platform jurisdiction rule library: rule classes, statutory rules, promotion and demotion, and the JUR-SEED verification board",
  letter: "HR",
});

export default function HrAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HrAdminLayoutClient>{children}</HrAdminLayoutClient>;
}
