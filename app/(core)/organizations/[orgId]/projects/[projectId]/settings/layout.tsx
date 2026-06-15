import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { OrgProjectSettingsLayoutClient } from "./OrgProjectSettingsLayoutClient";

export const metadata = createRouteMetadata("/organizations", {
  titlePrefix: "Project Settings",
  title: "Organization",
  description: "Project settings within an organization workspace.",
  letter: "O",
});

export default function OrgProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProjectSettingsLayoutClient>{children}</OrgProjectSettingsLayoutClient>
  );
}
