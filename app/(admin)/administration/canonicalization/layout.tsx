// app/(admin)/administration/canonicalization/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { CanonicalizationLayoutClient } from "./CanonicalizationLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Canonicalization",
  description:
    "Live gate + audit snapshots for the DB canonicalization transition: certification summary, findings, broken functions, migration candidates, and per-table preflight/verify tools.",
  letter: "CZ",
});

export default function CanonicalizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CanonicalizationLayoutClient>{children}</CanonicalizationLayoutClient>;
}
