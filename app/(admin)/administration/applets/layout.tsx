import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { AppletsAdminLayoutClient } from "./AppletsAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Applets",
  description:
    "Manage public agent-backed apps: feature, verify, moderate, rate-limit",
  letter: "AA",
});

export default function AppletsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppletsAdminLayoutClient>{children}</AppletsAdminLayoutClient>;
}
