// app/(core)/exports/layout.tsx
//
// BRING YOUR EXPORT — module root metadata (favicon + OG for every /exports
// page). The route registry entry lives in constants/favicon-route-data.ts.

import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/exports", {
  title: "Bring your export",
  description:
    "Drop the export a service gave you — see what it is, what is in it, and send the parts worth keeping to a Masterwork Rulebook.",
  letter: "EX",
});

export default function ExportsLayout({ children }: { children: ReactNode }) {
  // A route layout boundary must never clip its children unconditionally
  // (core-route-headers § failure class 2): each leaf owns its own scrolling.
  return <>{children}</>;
}
