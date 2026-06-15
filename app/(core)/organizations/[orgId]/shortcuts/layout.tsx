import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { OrgShortcutsLayoutClient } from "./OrgShortcutsLayoutClient";

export const metadata = createRouteMetadata("/organizations", {
  titlePrefix: "Shortcuts",
  title: "Organization",
  description: "Organization shortcuts, categories, and content blocks.",
  letter: "O",
});

export default function OrgShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrgShortcutsLayoutClient>{children}</OrgShortcutsLayoutClient>;
}
