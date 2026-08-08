"use client";

/**
 * The route's ONE dynamic edge (Fragmentation Law): the whole backlinks
 * workspace — recharts included — loads as a single ssr:false chunk group.
 * Everything inside BacklinksWorkspace imports statically.
 */

import dynamic from "next/dynamic";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

const BacklinksWorkspace = dynamic(
  () =>
    import(
      "@/features/marketing/components/backlinks/BacklinksWorkspace"
    ).then((mod) => mod.BacklinksWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Loading backlink intelligence…" />,
  },
);

export function BacklinksGate() {
  return <BacklinksWorkspace />;
}
