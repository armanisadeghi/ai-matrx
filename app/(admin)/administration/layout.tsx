import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
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

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientAdminLayout>{children}</ClientAdminLayout>;
}
