// app/(authenticated)/(admin-auth)/administration/scheduling/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { SchedulingAdminLayoutClient } from "./SchedulingAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Scheduling",
  description:
    "System-wide view of scheduled tasks, runs, scanner health, and templates",
  letter: "SC",
});

export default function SchedulingAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SchedulingAdminLayoutClient>{children}</SchedulingAdminLayoutClient>
  );
}
