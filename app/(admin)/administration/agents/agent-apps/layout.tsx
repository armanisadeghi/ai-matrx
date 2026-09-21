import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { AgentAppsAdminLayoutClient } from "./AgentAppsAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Agent Apps",
  description:
    "Manage public agent-backed apps: feature, verify, moderate, rate-limit",
  letter: "AA",
});

export default function AgentAppsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentAppsAdminLayoutClient>{children}</AgentAppsAdminLayoutClient>;
}
