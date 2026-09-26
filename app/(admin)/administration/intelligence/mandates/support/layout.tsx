import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Mandate support lookup",
  description:
    "Support tool: look into an organization's or a person's mandates while doing tech support",
  letter: "MS",
  canonicalPath: "/administration/intelligence/mandates/support",
});

export default function AdminMandateSupportLookupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
