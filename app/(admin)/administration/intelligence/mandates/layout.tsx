import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Mandates",
  description: "Every mandate — the job, what holds it, and who customized it",
  letter: "MA",
  canonicalPath: "/administration/intelligence/mandates",
});

export default function AdminIntelligenceMandatesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
