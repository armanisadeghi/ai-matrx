import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { ModuleLinkPackLayoutClient } from "./ModuleLinkPackLayoutClient";

export const metadata = createRouteMetadata("/admin", {
  titlePrefix: "Module Link Pack",
  title: "Admin",
  description: "Template for module navigation and link-pack admin pages",
  letter: "Mk",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleLinkPackLayoutClient>{children}</ModuleLinkPackLayoutClient>;
}
