import React, { Suspense } from "react";
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
  return (
    <Suspense fallback={<div className="flex-1 min-h-0">{children}</div>}>
      <DatabaseAdminLayoutClient>{children}</DatabaseAdminLayoutClient>
    </Suspense>
  );
}
