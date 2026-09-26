"use client";

/**
 * features/marketing/seo/topical-map/canvas/TopicalMapCanvasBody.tsx — the
 * map in the chat's side canvas (R12; "your feature … will require a canvas
 * surface that renders in chat" — Arman).
 *
 * BARE BODY, no frame: `CanvasPane` draws the pane and its title, so this
 * renders a thin screen-switcher strip and THE ONE `TopicalMapWorkspaceBody`
 * in `host="canvas"` — the same component the page route and the floating
 * window mount. The screen lives here (the canvas owner keeps it, per the
 * body contract) and the pointer's `screen` seeds it.
 *
 * "Ask the map" opens the map agent IN PLACE through `useOpenMandateWindow`;
 * the body's `SurfaceRuntimeProvider` is what hands the agent the map's live
 * values (R18), so nothing rides `user_input` from here.
 */

import { useState } from "react";
import {
  FileText,
  Files,
  History,
  LayoutList,
  type LucideIcon,
  Network,
  Table2,
  AppWindow,
} from "lucide-react";

import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";
import { cn } from "@/lib/utils";

import { TopicalMapEmpty } from "../components/TopicalMapStates";
import { TopicalMapWorkspaceBody } from "../components/TopicalMapWorkspaceBody";
import { MAP_CURATION_MANDATE_KEY, TOPICAL_MAP_SURFACE_NAME } from "../mandateKeys";
import type { MapWorkspaceScreen } from "../useMapWorkspaceParams";
import { isWorkspaceScreen } from "./topicalMapCanvasContent";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export interface TopicalMapCanvasBodyProps {
  mapId: string;
  initialScreen?: string | null;
  siteId: string | null;
  /** The chat this pane was opened from, when known (not read today; kept for parity with the other panes). */
  conversationId?: string | null;
  className?: string;
}

const SCREENS: { screen: MapWorkspaceScreen; label: string; icon: LucideIcon }[] = [
  { screen: "outline", label: "Outline", icon: LayoutList },
  { screen: "table", label: "Table", icon: Table2 },
  { screen: "graph", label: "Graph", icon: Network },
  { screen: "text", label: "Text", icon: FileText },
  { screen: "pages", label: "Pages", icon: Files },
  { screen: "history", label: "History", icon: History },
];

export function TopicalMapCanvasBody({
  mapId,
  initialScreen,
  siteId,
  className,
}: TopicalMapCanvasBodyProps) {
  const [screen, setScreen] = useState<MapWorkspaceScreen>(
    isWorkspaceScreen(initialScreen) ? initialScreen : "outline",
  );
  const openMandate = useOpenMandateWindow();
  const openWindow = useOpenTopicalMapWindow();

  if (!mapId) {
    return (
      <div className={cn("p-4", className)}>
        <TopicalMapEmpty
          title="No map was named"
          detail="This canvas pane was opened without a map id, so there is nothing to show. Open a map from a tool result or a proposed tree."
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <div
          role="group"
          aria-label="Map screen"
          className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
        >
          {SCREENS.map(({ screen: candidate, label, icon: Icon }) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={screen === candidate}
              title={label}
              onClick={() => setScreen(candidate)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs transition-colors",
                screen === candidate
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          title="Ask the map agent (opens in place)"
          className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() =>
            openMandate({
              initialMandateKey: MAP_CURATION_MANDATE_KEY,
              mandateKeys: [MAP_CURATION_MANDATE_KEY],
              surfaceName: TOPICAL_MAP_SURFACE_NAME,
            })
          }
        >
          <AGENT_ICON className="h-3.5 w-3.5" aria-hidden />
          Ask the map
        </button>
        <button
          type="button"
          title="Float this map as a window"
          className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => openWindow({ mapId, screen, siteId })}
        >
          <AppWindow className="h-3.5 w-3.5" aria-hidden />
          Window
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <TopicalMapWorkspaceBody
          mapId={mapId}
          screen={screen}
          siteId={siteId}
          host="canvas"
          onScreenChange={setScreen}
        />
      </div>
    </div>
  );
}
