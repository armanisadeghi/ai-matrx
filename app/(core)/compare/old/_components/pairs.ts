// app/(core)/compare/old/_components/pairs.ts — each old page beside the live
// page that replaced it (the /compare/old index reads this list).

import {
  HUB_DATA_STORES_HREF,
  HUB_LIBRARIES_HREF,
  HUB_LIBRARY_CATALOG_HREF,
  HUB_SOURCES_HREF,
  SEARCH_LAB_ADMIN_PATH,
} from "@/features/knowledge/hub/legacyRoutes";

export interface ComparePair {
  name: string;
  /** Where the page used to live. */
  oldAddress: string;
  oldHref: string;
  newHref: string;
  newLabel: string;
  note?: string;
  extra?: { href: string; label: string };
}

export const COMPARE_PAIRS: ComparePair[] = [
  { name: "Sources", oldAddress: "/knowledge/library", oldHref: "/compare/old/sources", newHref: HUB_SOURCES_HREF, newLabel: "Hub · Sources" },
  { name: "Knowledge home", oldAddress: "/rag (RagHomePage)", oldHref: "/compare/old/knowledge-home", newHref: "/knowledge", newLabel: "Knowledge hub" },
  {
    name: "/rag/* pages",
    oldAddress: "/rag/*",
    oldHref: "/compare/old/rag",
    newHref: "/knowledge",
    newLabel: "Knowledge hub",
    note: "Every /rag/* page was a twin of a /knowledge/* page; this row opens the old family's map.",
  },
  {
    name: "Graph demo",
    oldAddress: "/knowledge/visualization",
    oldHref: "/compare/old/graph-demo",
    newHref: "/knowledge/flow",
    newLabel: "Knowledge flow",
    note: "The old address now redirects to /knowledge; the animation itself lives on at /knowledge/flow.",
  },
  {
    name: "Search Lab",
    oldAddress: "/knowledge/search",
    oldHref: "/compare/old/search-lab",
    newHref: "/knowledge",
    newLabel: "Hub search",
    extra: { href: SEARCH_LAB_ADMIN_PATH, label: "Admin Search Lab (developer tabs)" },
  },
  { name: "Data stores", oldAddress: "/knowledge/data-stores", oldHref: "/compare/old/data-stores", newHref: HUB_DATA_STORES_HREF, newLabel: "Hub · Data stores" },
  { name: "Library catalog", oldAddress: "/knowledge/library-catalog", oldHref: "/compare/old/library-catalog", newHref: HUB_LIBRARY_CATALOG_HREF, newLabel: "Hub · Library catalog" },
  { name: "Libraries", oldAddress: "/libraries", oldHref: "/compare/old/libraries", newHref: HUB_LIBRARIES_HREF, newLabel: "Hub · Libraries" },
  {
    name: "Transcripts",
    oldAddress: "/transcripts",
    oldHref: "/compare/old/transcripts",
    newHref: "/knowledge?view=transcripts",
    newLabel: "Hub · Transcripts",
  },
];
