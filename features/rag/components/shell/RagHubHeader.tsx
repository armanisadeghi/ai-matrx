"use client";

// RagHubHeader — the ONE shell header for the RAG/Knowledge hub level
// (`/rag`, `/rag/data-stores`, `/rag/library`, `/rag/search`,
// `/rag/repositories`). Center is the canonical section nav (RouteModeNav);
// callers pass their contextual action tap-buttons via `right`. No title
// text — the nav IS the identity. Pattern mirrors CmsHubHeader.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { Home, Database, FileText, Search, Code2 } from "lucide-react";

const HUB_NAV_ITEMS = [
  { name: "Home", href: "/rag", icon: Home },
  { name: "Data Stores", href: "/rag/data-stores", icon: Database },
  { name: "Library", href: "/rag/library", icon: FileText },
  { name: "Search", href: "/rag/search", icon: Search },
  { name: "Repositories", href: "/rag/repositories", icon: Code2 },
];

export function RagHubHeader({ right }: { right?: React.ReactNode }) {
  return (
    <RouteHeader center={<RouteModeNav items={HUB_NAV_ITEMS} />} right={right} />
  );
}
