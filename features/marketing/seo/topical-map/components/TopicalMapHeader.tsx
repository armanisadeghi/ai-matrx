"use client";

/**
 * Shell-header controls for one map's workspace — injected into the PageHeader
 * centre zone, never rendered as an in-body toolbar (core-route-headers,
 * failure class 1).
 *
 * Back to the brand's maps + the map's name as a sibling dropdown + the six
 * screens as a `RouteModeNav`. Every mode item carries an icon: RouteModeNav
 * skips its icon-only stage entirely when even one is missing, which turns the
 * nav's three-stage collapse into two.
 */

import { useMemo } from "react";
import {
  History,
  LayoutList,
  type LucideIcon,
  Network,
  Table2,
  FileText,
  Files,
} from "lucide-react";

import {
  EntityModeHeader,
  type EntityOption,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { useTopicalMaps } from "../hooks";
import { useMapWorkspaceParams, type MapWorkspaceScreen } from "../useMapWorkspaceParams";

const SCREENS: { screen: MapWorkspaceScreen; label: string; icon: LucideIcon }[] = [
  { screen: "outline", label: "Outline", icon: LayoutList },
  { screen: "table", label: "Table", icon: Table2 },
  { screen: "graph", label: "Graph", icon: Network },
  { screen: "text", label: "Text", icon: FileText },
  { screen: "pages", label: "Pages", icon: Files },
  { screen: "history", label: "History", icon: History },
];

export function TopicalMapHeader({ mapId }: { mapId: string }) {
  const { brandSeg, brandId, organizationId, screen, screenHref, homeHref, siteId } =
    useMapWorkspaceParams(mapId);
  // access-errors: ok — the sibling-map dropdown; a failed read only empties the
  // picker, and the body below owns the record-level refusal for THIS map.
  const maps = useTopicalMaps({ organizationId, brandId });

  const active = (maps.data ?? []).find((map) => map.id === mapId) ?? null;

  const entityOptions = useMemo<EntityOption[]>(
    () =>
      (maps.data ?? []).map((map) => ({
        label: map.name,
        href: marketingRoutes.brandTopicalMapView(
          brandSeg,
          map.id,
          screen,
          siteId ?? undefined,
        ),
        active: map.id === mapId,
      })),
    [maps.data, brandSeg, screen, siteId, mapId],
  );

  const modes = useMemo<RouteNavItem[]>(
    () =>
      SCREENS.map((item) => ({
        name: item.label,
        href: screenHref(item.screen),
        icon: item.icon,
      })),
    [screenHref],
  );

  return (
    <EntityModeHeader
      backHref={homeHref}
      entityLabel={
        active?.name ?? (maps.isLoading ? "Loading maps…" : "Topical map")
      }
      entityOptions={entityOptions}
      modes={modes}
      activeModeHref={screenHref(screen)}
    />
  );
}
