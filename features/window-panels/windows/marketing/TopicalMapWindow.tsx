"use client";

/**
 * The topical map as a floating window (CONTRACTS.md §5, reserved for Lane G).
 *
 * "The window panel is the most important one as it allows the feature to be
 * added ANYWHERE in the system" (Arman). This file is CHROME ONLY: it wraps
 * the ONE canonical `TopicalMapWorkspaceBody` in `host="window"` — the same
 * component the page route renders — and puts the six screens in the title
 * bar as a switcher that drives the body's `screen` prop. A window-flavoured
 * body would be a second renderer that drifts (CLAUDE.md § A WINDOW PANEL
 * WRAPS THE CANONICAL COMPONENT).
 *
 * `mapId: ""` IS A REAL STATE. The Tools grid opens the window without a map,
 * so the body shows a picker of the maps the person can view — never a dead
 * frame, never a guessed map.
 *
 * The screen the OPENER asked for can change while the window is open (a
 * "Review N proposals" click on a map already floating): the opener
 * re-dispatches the instance data and this component follows it.
 */

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  ExternalLink,
  FileText,
  Files,
  History,
  LayoutList,
  type LucideIcon,
  Network,
  Table2,
} from "lucide-react";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import {
  TOPICAL_MAP_PICKER_INSTANCE_ID,
  type TopicalMapWindowScreen,
} from "@/features/overlays/openers/topicalMapWindow";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
} from "@/features/marketing/seo/topical-map/components/TopicalMapStates";
import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";
import { useTopicalMap, useTopicalMaps } from "@/features/marketing/seo/topical-map/hooks";
import {
  MAP_CURATION_MANDATE_KEY,
  TOPICAL_MAP_SURFACE_NAME,
} from "@/features/marketing/seo/topical-map/mandateKeys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay, selectOpenInstances } from "@/lib/redux/slices/overlaySlice";
import { cn } from "@/lib/utils";

export interface TopicalMapWindowProps {
  onClose: () => void;
  /** The overlay instanceId — also the window-manager id. */
  instanceId: string;
  stackIndex?: number;
  /** Empty = show the map picker. */
  mapId: string;
  screen: TopicalMapWindowScreen;
  siteId: string | null;
}

const SCREENS: { screen: TopicalMapWindowScreen; label: string; icon: LucideIcon }[] = [
  { screen: "outline", label: "Outline", icon: LayoutList },
  { screen: "table", label: "Table", icon: Table2 },
  { screen: "graph", label: "Graph", icon: Network },
  { screen: "text", label: "Text", icon: FileText },
  { screen: "pages", label: "Pages", icon: Files },
  { screen: "history", label: "History", icon: History },
];

export default function TopicalMapWindow({
  onClose,
  instanceId,
  stackIndex = 0,
  mapId: initialMapId,
  screen: initialScreen,
  siteId: initialSiteId,
}: TopicalMapWindowProps) {
  const dispatch = useAppDispatch();
  const [mapId, setMapId] = useState(initialMapId);
  const [screen, setScreen] = useState<TopicalMapWindowScreen>(initialScreen);
  const [siteId] = useState<string | null>(initialSiteId);

  // Follow a screen the opener re-dispatched onto this instance.
  const instances = useAppSelector((s) => selectOpenInstances(s, "topicalMapWindow"));
  const liveData = instances.find((inst) => inst.instanceId === instanceId)?.data as
    | { screen?: unknown }
    | null
    | undefined;
  const liveScreen = liveData?.screen;
  useEffect(() => {
    if (
      typeof liveScreen === "string" &&
      SCREENS.some((s) => s.screen === liveScreen) &&
      liveScreen !== screen
    ) {
      setScreen(liveScreen as TopicalMapWindowScreen);
    }
    // Only the opener's value matters here; the local switcher owns `screen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveScreen]);

  const map = useTopicalMap(mapId, Boolean(mapId));
  const openMandate = useOpenMandateWindow();

  const cascade = (stackIndex % 8) * 28;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const rect = {
    width: Math.min(880, vw - 32),
    height: Math.min(640, vh - 32),
    x: Math.max(0, Math.min((vw - 880) / 2 + cascade, vw - 400)),
    y: Math.max(0, Math.min((vh - 640) / 6 + cascade, vh - 300)),
  };

  const title = mapId ? (map.data?.name ?? "Topical map") : "Topical map";

  return (
    <WindowPanel
      id={instanceId}
      title={title}
      onClose={onClose}
      overlayId="topicalMapWindow"
      overlayInstanceId={instanceId}
      minWidth={420}
      minHeight={320}
      initialRect={rect}
      urlSyncKey="topical_map"
      urlSyncId={mapId || TOPICAL_MAP_PICKER_INSTANCE_ID}
      urlSyncArgs={mapId ? { s: screen } : undefined}
      onCollectData={() => ({ mapId, screen, siteId })}
      actionsLeft={
        mapId ? (
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
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>
        ) : undefined
      }
      actionsRight={
        mapId ? (
          <>
            <button
              type="button"
              title="Ask the map agent (opens in place)"
              aria-label="Ask the map agent"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() =>
                openMandate({
                  initialMandateKey: MAP_CURATION_MANDATE_KEY,
                  mandateKeys: [MAP_CURATION_MANDATE_KEY],
                  surfaceName: TOPICAL_MAP_SURFACE_NAME,
                })
              }
            >
              <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
            </button>
            <a
              href={marketingRoutes.topicalMapDoor(mapId)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this map as a page in a new tab"
              aria-label="Open this map as a page in a new tab"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </>
        ) : undefined
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
    >
      {mapId ? (
        map.isError ? (
          <TopicalMapFailed what="this map" error={map.error} />
        ) : (
          <TopicalMapWorkspaceBody
            mapId={mapId}
            screen={screen}
            siteId={siteId}
            host="window"
            onScreenChange={setScreen}
          />
        )
      ) : (
        <MapPicker
          onPick={(id) => {
            setMapId(id);
            // Re-key the instance data so restore and the URL carry the map.
            dispatch(
              openOverlay({
                overlayId: "topicalMapWindow",
                instanceId,
                data: { stackIndex, mapId: id, screen, siteId },
              }),
            );
          }}
        />
      )}
    </WindowPanel>
  );
}

/** The maps this person can view in the active organization — the empty-map state. */
function MapPicker({ onPick }: { onPick: (mapId: string) => void }) {
  const { organizationId, organizationState } = useOrganizationRequired();
  const maps = useTopicalMaps({ organizationId: organizationId ?? "" }, Boolean(organizationId));

  if (organizationState !== "ready") {
    return (
      <OrganizationContextNotice
        state={organizationState}
        what="Topical maps"
        title="No organization is active"
        description="Pick an organization in the top bar; its topical maps will be listed here."
      />
    );
  }
  if (maps.isPending) return <SuspenseLoader message="Listing this organization's topical maps…" />;
  if (maps.isError) return <TopicalMapFailed what="this organization's topical maps" error={maps.error} />;
  if (maps.data.length === 0) {
    return (
      <TopicalMapEmpty
        title="No topical map yet"
        detail="Start one from a brand's Content home; it will appear here and can then float over any screen."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pick a map
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {maps.data.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => onPick(row.id)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                {row.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.description}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs capitalize text-muted-foreground">{row.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
