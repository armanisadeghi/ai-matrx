// features/scopes/components/management/ScopesHubHeader.tsx
//
// The ONE shell header for the scopes hub level (`/scopes`,
// `/scopes/settings`). Center is the canonical section nav (RouteModeNav) — the
// nav IS the identity, no title text. Right carries the cross-feature quick
// links that used to live in an in-body header bar on ScopesHub.

"use client";

import { Building, ListChecks, Network, Settings as SettingsIcon } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav, type RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import { KgSuggestionsNavButton } from "@/features/kg-suggestions/components/KgSuggestionsNavButton";

const HUB_NAV_ITEMS: RouteNavItem[] = [
  { name: "Scopes", href: "/scopes", icon: Building },
  { name: "Settings", href: "/scopes/settings", icon: SettingsIcon },
];

export function ScopesHubHeader() {
  return (
    <RouteHeader
      center={<RouteModeNav items={HUB_NAV_ITEMS} />}
      right={
        <div className="hidden sm:flex items-center gap-1">
          <KgSuggestionsNavButton variant="outline" className="h-8" />
          {/* Tap buttons space themselves: grouped with no gap. */}
          <div className="flex items-center">
            <TapTargetButton
              icon={<ListChecks className="h-4 w-4" />}
              ariaLabel="Context items"
              href="/context-items"
            />
            <TapTargetButton
              icon={<Network className="h-4 w-4" />}
              ariaLabel="Knowledge graph"
              href="/knowledge/graph"
            />
          </div>
        </div>
      }
    />
  );
}

export default ScopesHubHeader;
