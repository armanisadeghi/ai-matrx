import React from "react";
import { OrgShortcutsLayoutClient } from "./OrgShortcutsLayoutClient";

export default function OrgShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrgShortcutsLayoutClient>{children}</OrgShortcutsLayoutClient>;
}
