// app/(admin)/administration/applications/layout.tsx
//
// Applications hub — route-tabbed shell governing OUR shipped client
// applications (desktop, extension, mobile): remote configuration
// (public.app_config), remote catalogs (public.catalog_entries), the installed
// fleet (public.app_instances), and one unified audit history. Each tab is its
// own route; this layout owns the viewport height and the tab bar (the
// users / relationships admin hub pattern). Super-admin gating is inherited
// from app/(admin)/layout.tsx — not re-done here.
//
// Naming: "app"/"apps" is reserved for user-created agent apps. This hub is
// always "Applications".

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { ApplicationsAdminLayoutClient } from "./ApplicationsAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Applications",
  description:
    "Shipped client applications — remote configuration, catalogs, installed fleet, and audit history",
  letter: "AP",
});

export default function ApplicationsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ApplicationsAdminLayoutClient>{children}</ApplicationsAdminLayoutClient>;
}
