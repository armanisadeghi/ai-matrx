import React from "react";
import { join } from "path";
import { createRouteMetadata } from "@/utils/route-metadata";
import { scanRoutes } from "@/utils/route-discovery";
import { ClientAdminLayout } from "./ClientAdminLayout";

export const metadata = createRouteMetadata("/administration", {
  title: "Administration",
  description: "Administrative tools and system management",
  letter: "Ao",
  additionalMetadata: {
    keywords: [
      "administration",
      "admin",
      "system management",
      "database",
      "settings",
    ],
  },
});

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Full filesystem route hierarchy under /administration — powers the
  // breadcrumb "drill one level deeper" dropdowns.
  const routes = await scanRoutes(
    join(process.cwd(), "app", "(admin)", "administration"),
    "administration",
  );

  return <ClientAdminLayout routes={routes}>{children}</ClientAdminLayout>;
}
