import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { CxDashboardLayoutClient } from "./CxDashboardLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "CX Dashboard",
  description:
    "Customer experience metrics, conversations, AI requests, usage, and errors",
  letter: "CX",
});

export default function CxDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CxDashboardLayoutClient>{children}</CxDashboardLayoutClient>;
}
