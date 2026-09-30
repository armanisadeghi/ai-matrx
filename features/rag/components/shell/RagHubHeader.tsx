"use client";

// RagHubHeader — the ONE shell header for the Knowledge/Knowledge hub level
// (`/knowledge/data-stores`, `/knowledge/library-catalog`, `/knowledge/library-curate`,
// `/knowledge/repositories`; Sources is the hub since H6a; the Search Lab is a kept user page). Center is the canonical section nav (RouteModeNav);
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
import { HUB_DATA_STORES_HREF, HUB_LIBRARY_CATALOG_HREF, HUB_SOURCES_HREF, SEARCH_LAB_PATH } from "@/features/knowledge/hub/legacyRoutes";

const HUB_NAV_ITEMS = [
  { name: "Hub", href: "/knowledge", icon: Home },
  { name: "Data Stores", href: HUB_DATA_STORES_HREF, icon: Database },
  { name: "Sources", href: HUB_SOURCES_HREF, icon: FileText },
  { name: "Catalog", href: HUB_LIBRARY_CATALOG_HREF, icon: Library },
  { name: "Search Lab", href: SEARCH_LAB_PATH, icon: Search },
  { name: "Repositories", href: "/knowledge/repositories", icon: Code2 },
];

/**
 * The Data Stores and Catalog tabs open the hub's container groups (H6b), so a
 * pathname match would light "Hub" on their record pages; the record page's
 * own route names its tab.
 */
function activeTabFor(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith("/knowledge/data-stores")) return HUB_DATA_STORES_HREF;
  if (pathname.startsWith("/knowledge/library-catalog") || pathname.startsWith("/knowledge/library-curate"))
    return HUB_LIBRARY_CATALOG_HREF;
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
