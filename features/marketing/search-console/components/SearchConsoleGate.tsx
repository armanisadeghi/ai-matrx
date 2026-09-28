"use client";

/**
 * The route's ONE dynamic edge (Fragmentation Law): the whole Search Console
 * workspace — recharts included — loads as a single ssr:false chunk group.
 * Everything inside SearchConsoleWorkspace imports statically.
 */

import dynamic from "next/dynamic";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

/** The workspace's title, drawn by the server while the chunk loads — the
 *  workspace's own RouteHeader puts the same title in the same place. */
function SearchConsoleHeaderFallback() {
  return (
    <RouteHeader
      left={
        <div className="ml-2 flex min-w-0 items-center gap-2">
          <h1 className="whitespace-nowrap text-sm font-medium text-foreground">
            Search Console
          </h1>
        </div>
      }
    />
  );
}

const SearchConsoleWorkspace = dynamic(
  () =>
    import(
      "@/features/marketing/search-console/components/SearchConsoleWorkspace"
    ).then((mod) => mod.SearchConsoleWorkspace),
  {
    ssr: false,
    loading: () => (
      <>
        <SearchConsoleHeaderFallback />
        <LoadingSurface label="Loading Search Console…" />
      </>
    ),
  },
);

export function SearchConsoleGate() {
  return <SearchConsoleWorkspace />;
}
