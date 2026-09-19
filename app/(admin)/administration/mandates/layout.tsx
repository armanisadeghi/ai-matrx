import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Mandates",
  description: "Manage platform mandate definitions, pins, and bindings",
  letter: "AMD",
});

export default function AdminMandatesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
