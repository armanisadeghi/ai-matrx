import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PersonalProjectSettingsLayoutClient } from "./PersonalProjectSettingsLayoutClient";

export const metadata = createRouteMetadata("/projects", {
  titlePrefix: "Personal Settings",
  title: "Projects",
  description:
    "Personal project settings: name, defaults, and workspace options",
  letter: "Ps",
});

export default function PersonalProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PersonalProjectSettingsLayoutClient>
      {children}
    </PersonalProjectSettingsLayoutClient>
  );
}
