"use client";

// ScraperHubHeader — the ONE shell header for the whole /scraper feature
// (`/scraper`, `/scraper/quick`, `/scraper/search`, `/scraper/search-and-scrape`).
// Center is the canonical mode nav (RouteModeNav) — no title text, the nav IS
// the identity. Mounted once at the layout level per core-route-headers.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { Globe, Zap, Search, ScanSearch } from "lucide-react";

const HUB_NAV_ITEMS = [
  { name: "Home", href: "/scraper", icon: Globe },
  { name: "Quick Scrape", href: "/scraper/quick", icon: Zap },
  { name: "Search", href: "/scraper/search", icon: Search },
  { name: "Search & Scrape", href: "/scraper/search-and-scrape", icon: ScanSearch },
];

export function ScraperHubHeader({ right }: { right?: React.ReactNode }) {
  return <RouteHeader center={<RouteModeNav items={HUB_NAV_ITEMS} />} right={right} />;
}
