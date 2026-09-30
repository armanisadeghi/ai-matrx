"use client";

// RagHubHeader — the ONE shell header for the Knowledge/Knowledge hub level
// (`/knowledge/data-stores`, `/knowledge/library-catalog`, `/knowledge/library-curate`,
// `/knowledge/repositories`; Sources, Catalog and Data Stores are module pages; the Search Lab is a kept user page). Center is the canonical section nav (RouteModeNav);
// callers pass their contextual action tap-buttons via `right`. No title
// text — the nav IS the identity. Pattern mirrors CmsHubHeader.

import { usePathname } from "next/navigation";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import {
  Home,
  Database,
  FileText,
  Code2,
  Library,
  Search,
} from "lucide-react";
import { SEARCH_LAB_PATH } from "@/features/knowledge/hub/legacyRoutes";
import { DATA_STORES_PATH, KNOWLEDGE_HUB_PATH, LIBRARY_CATALOG_PATH, SOURCES_PATH } from "@/features/knowledge/modulePaths";

const HUB_NAV_ITEMS = [
  { name: "Hub", href: KNOWLEDGE_HUB_PATH, icon: Home },
  { name: "Data Stores", href: DATA_STORES_PATH, icon: Database },
  { name: "Sources", href: SOURCES_PATH, icon: FileText },
  { name: "Catalog", href: LIBRARY_CATALOG_PATH, icon: Library },
  { name: "Search Lab", href: SEARCH_LAB_PATH, icon: Search },
  { name: "Repositories", href: "/knowledge/repositories", icon: Code2 },
];

/**
 * Each tab is its module's own page; a record page under a module keeps that
 * module's tab lit.
 */
function activeTabFor(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith(DATA_STORES_PATH)) return DATA_STORES_PATH;
  if (pathname.startsWith(LIBRARY_CATALOG_PATH) || pathname.startsWith("/knowledge/library-curate"))
    return LIBRARY_CATALOG_PATH;
  if (pathname.startsWith(SOURCES_PATH)) return SOURCES_PATH;
  if (pathname.startsWith("/knowledge/repositories")) return "/knowledge/repositories";
  return undefined;
}

export function RagHubHeader({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RouteHeader
      center={<RouteModeNav items={HUB_NAV_ITEMS} activeHref={activeTabFor(pathname)} />}
      right={right}
    />
  );
}
