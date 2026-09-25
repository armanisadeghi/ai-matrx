import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Intelligence",
  description:
    "How agents, workflows and models serve the application — Mandates, and more to come",
  letter: "IN",
  canonicalPath: "/administration/intelligence",
});

export default function AdminIntelligenceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
