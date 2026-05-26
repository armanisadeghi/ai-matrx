import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Shortcuts",
  title: "Agents",
  description: "Manage your personal agent shortcuts",
  letter: "MS",
});

export default function UserAgentShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
