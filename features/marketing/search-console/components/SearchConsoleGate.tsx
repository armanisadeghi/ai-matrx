"use client";

/**
 * The route's ONE dynamic edge (Fragmentation Law): the whole Search Console
 * workspace — recharts included — loads as a single ssr:false chunk group.
 * Everything inside SearchConsoleWorkspace imports statically.
 */

import dynamic from "next/dynamic";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

const SearchConsoleWorkspace = dynamic(
  () =>
    import(
      "@/features/marketing/search-console/components/SearchConsoleWorkspace"
    ).then((mod) => mod.SearchConsoleWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Loading Search Console…" />,
  },
);

export function SearchConsoleGate() {
  return <SearchConsoleWorkspace />;
}
