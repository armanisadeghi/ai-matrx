import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Agent Skills",
  description:
    "Curate every skill on the platform — system, public, and user-owned. Promote, edit, soft-delete, ingest, and organize.",
  letter: "AS",
});

export default function SkillsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
