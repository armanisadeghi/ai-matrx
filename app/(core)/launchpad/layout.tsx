import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/launchpad", {
  title: "Launchpad",
  description:
    "An always-open starting point for finding and launching work across AI Matrx.",
});

export default function LaunchpadLayout({ children }: { children: ReactNode }) {
  return children;
}
