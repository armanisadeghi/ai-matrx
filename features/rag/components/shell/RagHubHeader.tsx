"use client";

// RagHubHeader — the ONE shell header for the Knowledge/Knowledge hub level
// (`/knowledge/data-stores`, `/knowledge/library-catalog`, `/knowledge/library-curate`,
// `/knowledge/repositories`; Sources and Search are the hub since H6a). Center is the canonical section nav (RouteModeNav);
// callers pass their contextual action tap-buttons via `right`. No title
// text — the nav IS the identity. Pattern mirrors CmsHubHeader.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import {
  Home,
  Database,
  FileText,
  Code2,
  Library,
} from "lucide-react";
import { HUB_DATA_STORES_HREF, HUB_LIBRARY_CATALOG_HREF, HUB_SOURCES_HREF } from "@/features/knowledge/hub/legacyRoutes";

const HUB_NAV_ITEMS = [
  { name: "Hub", href: "/knowledge", icon: Home },
  { name: "Data Stores", href: HUB_DATA_STORES_HREF, icon: Database },
  { name: "Sources", href: HUB_SOURCES_HREF, icon: FileText },
  { name: "Catalog", href: HUB_LIBRARY_CATALOG_HREF, icon: Library },
  { name: "Repositories", href: "/knowledge/repositories", icon: Code2 },
];

export function RagHubHeader({ right }: { right?: React.ReactNode }) {
  return (
    <RouteHeader
      center={<RouteModeNav items={HUB_NAV_ITEMS} />}
      right={right}
    />
  );
}
