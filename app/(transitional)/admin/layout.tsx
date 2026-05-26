import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { AdminDashboardLayoutClient } from "./AdminDashboardLayoutClient";

export const metadata = createRouteMetadata("/admin", {
  title: "Admin",
  description: "Internal admin dashboard, experiments, and developer utilities",
  letter: "An",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminDashboardLayoutClient>{children}</AdminDashboardLayoutClient>;
}
