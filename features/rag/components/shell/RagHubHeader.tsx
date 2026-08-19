"use client";

// RagHubHeader — the ONE shell header for the Knowledge/Knowledge hub level
// (`/knowledge`, `/knowledge/data-stores`, `/knowledge/library`, `/knowledge/search`,
// `/knowledge/repositories`). Center is the canonical section nav (RouteModeNav);
// callers pass their contextual action tap-buttons via `right`. No title
// text — the nav IS the identity. Pattern mirrors CmsHubHeader.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import {
  Home,
  Database,
  FileText,
  Search,
  Code2,
  Library,
  Binary,
} from "lucide-react";

const HUB_NAV_ITEMS = [
  { name: "Home", href: "/knowledge", icon: Home },
  { name: "Data Stores", href: "/knowledge/data-stores", icon: Database },
  { name: "Library", href: "/knowledge/library", icon: FileText },
  { name: "Catalog", href: "/knowledge/library-catalog", icon: Library },
  { name: "Search", href: "/knowledge/search", icon: Search },
  { name: "Embeddings", href: "/knowledge/embeddings", icon: Binary },
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
