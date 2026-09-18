"use client";

/**
 * THE READ-ONLY DOOR'S BODY (R7): the real workspace views, brand-free.
 *
 * A record-only grantee — a client the map was shared with — can read the map
 * but not the brand above it, so the nested route would hand them an
 * AccessGate for a brand they were never given. The id door renders THIS
 * instead: the same `TopicalMapWorkspaceBody` every host uses, under a
 * `MapLinkProvider brand={null}` so every door it produces is a flat id door,
 * with `readOnly` so every write control is ABSENT (never disabled-looking).
 *
 * The screen lives in this adapter's state (the flat door has no per-screen
 * routes); the switcher is rendered here because the body carries no chrome
 * (CONTRACTS §1) and the page host owns navigation.
 */

import { useState } from "react";
import { FileText, Files, History, LayoutList, Network, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { TopicalMapWorkspaceBody } from "../components/TopicalMapWorkspaceBody";
import { MapLinkProvider } from "../links";
import type { MapWorkspaceScreen } from "../useMapWorkspaceParams";

const SCREENS: { screen: MapWorkspaceScreen; label: string; icon: typeof LayoutList }[] = [
  { screen: "outline", label: "Outline", icon: LayoutList },
  { screen: "table", label: "Table", icon: Table2 },
  { screen: "graph", label: "Graph", icon: Network },
  { screen: "text", label: "Text", icon: FileText },
  { screen: "pages", label: "Pages", icon: Files },
  { screen: "history", label: "History", icon: History },
];

export function TopicalMapDoorBody({
  mapId,
  revealSlug,
}: {
  mapId: string;
  /** `?topic=<slug>` from the topic door. */
  revealSlug: string | null;
}) {
  const [screen, setScreen] = useState<MapWorkspaceScreen>("outline");

  return (
    <MapLinkProvider brand={null}>
      <div className="flex h-full min-h-0 flex-col">
        <nav
          aria-label="Map screens"
          className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5"
        >
          {SCREENS.map((item) => {
            const Icon = item.icon;
            const active = item.screen === screen;
            return (
              <button
                key={item.screen}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setScreen(item.screen)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm",
                  active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TopicalMapWorkspaceBody
            mapId={mapId}
            screen={screen}
            siteId={null}
            host="page"
            readOnly
            revealSlug={revealSlug}
            onScreenChange={setScreen}
          />
        </div>
      </div>
    </MapLinkProvider>
  );
}
