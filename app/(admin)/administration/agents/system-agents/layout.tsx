import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { SystemAgentsLayoutClient } from "./SystemAgentsLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "System Agents",
  description:
    "Manage system (builtin) agents, global shortcuts, categories, content blocks, and global agent apps",
  letter: "SA",
});

export default function SystemAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SystemAgentsLayoutClient>{children}</SystemAgentsLayoutClient>;
}
