import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/kits", {
  title: "Kits",
  description: "Install a working example — tables, an agent that reads them, and a workflow — in one click.",
});

export default function KitsLayout({ children }: { children: ReactNode }) {
  return children;
}
