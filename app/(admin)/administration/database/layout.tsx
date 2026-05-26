import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { DatabaseAdminLayoutClient } from "./DatabaseAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Database",
  description:
    "Database administration, schema tools, migrations, and data management",
  letter: "DB",
});

export default function DatabaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DatabaseAdminLayoutClient>{children}</DatabaseAdminLayoutClient>;
}
