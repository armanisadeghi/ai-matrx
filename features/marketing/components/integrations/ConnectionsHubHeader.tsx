"use client";

// ConnectionsHubHeader — the ONE shell header for the provider connection hub.
// It stays mounted across Overview, Google, and Bing so entering a provider
// never strands the user inside that setup surface.

import { Globe2, LayoutGrid, SearchCheck } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export const CONNECTIONS_HUB_ROUTES = [
  {
    name: "Overview",
    href: marketingRoutes.connections(),
    icon: LayoutGrid,
    exact: true,
  },
  {
    name: "Google",
    href: marketingRoutes.connectionsGoogle(),
    icon: SearchCheck,
  },
  {
    name: "Bing",
    href: marketingRoutes.connectionsBing(),
    icon: Globe2,
  },
];

export function ConnectionsHubHeader() {
  return (
    <RouteHeader center={<RouteModeNav items={CONNECTIONS_HUB_ROUTES} />} />
  );
}
