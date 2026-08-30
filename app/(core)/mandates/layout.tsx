import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/mandates", {
  title: "Mandates",
  description: "Browse delegated jobs and manage personal agent bindings",
});

export default function MandatesLayout({ children }: { children: ReactNode }) {
  return children;
}
