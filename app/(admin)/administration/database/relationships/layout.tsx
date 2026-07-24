// app/(admin)/administration/database/relationships/layout.tsx
//
// Relationships hub — route-tabbed shell for the entity/relationship control
// plane: overview + drift, association rules, the entity-types registry,
// shareable/link-sharing policy, the entity explorer, the reachability
// inspector, and the action catalog. Each tab is its own route; this layout
// owns the viewport height and the tab bar (scheduling-admin pattern).

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { RelationshipsAdminLayoutClient } from "./RelationshipsAdminLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Relationships",
  description:
    "Entity types, association rules, sharing registry, reachability, and actions",
  letter: "RM",
});

export default function RelationshipsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RelationshipsAdminLayoutClient>{children}</RelationshipsAdminLayoutClient>
  );
}
