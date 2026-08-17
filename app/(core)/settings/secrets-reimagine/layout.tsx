import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/settings/secrets-reimagine", {
  title: "Credentials",
  description: "Find and safely manage the sign-ins and keys you use with AI Matrx.",
  letter: "C",
});

export default function SecretsReimagineLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
