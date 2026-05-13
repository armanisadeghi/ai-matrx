import React from "react";
import { OrgProjectSettingsLayoutClient } from "./OrgProjectSettingsLayoutClient";

export default function OrgProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProjectSettingsLayoutClient>{children}</OrgProjectSettingsLayoutClient>
  );
}
