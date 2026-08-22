import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/masterwork", {
  title: "Masterwork",
  description:
    "Your expertise as rules you approve — built into a system that works exactly your way, proven against plain AI.",
  letter: "M",
});

export default function MasterworkLayout({ children }: { children: ReactNode }) {
  return children;
}
