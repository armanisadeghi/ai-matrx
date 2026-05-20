"use client";

/**
 * ToolsGrid — data-driven replacement for the ~570 lines of hand-written
 * MenuGridItem JSX that used to live inside SidebarWindowToggle.tsx.
 *
 * Reads `TOOLS_GRID_TILES` + `TOOLS_CATEGORIES`, groups tiles by category,
 * and renders the familiar MenuSection / MenuGridItem / MenuDivider pattern.
 *
 * Admin-gated categories and tiles are filtered using the `isAdmin` selector.
 * Each tile's click handler resolves its registry entry to decide singleton
 * vs multi-instance semantics, runs the optional `seedData` builder, then
 * dispatches `openOverlay(...)` — or calls the tile's custom `onActivate`.
 */
import { Fragment, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsCreator } from "@/lib/redux/selectors/userSelectors";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { getStaticEntryByOverlayId } from "@/features/window-panels/registry/windowRegistryMetadata";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { MenuDivider, MenuGridItem, MenuSection } from "./menuPrimitives";
import {
  TOOLS_CATEGORIES,
  TOOLS_GRID_TILES,
  type ToolsCategory,
  type ToolsGridTile,
  type TileContext,
} from "./toolsGridTiles";

interface ToolsGridProps {
  /**
   * Called after a tile is activated so the shell can close the popover.
   * Matches the legacy `act(() => ...)` wrapper that used to be inlined per
   * tile inside SidebarWindowToggle.
   */
  onAfterActivate?: () => void;
  /**
   * Which section to render. "tools" = everyday categories; "admin" = admin
   * category only; "creator" = creator category only. Lets SidebarWindowToggle
   * render one ToolsGrid per tab.
   */
  section: "tools" | "admin" | "creator";
}

export default function ToolsGrid({
  onAfterActivate,
  section,
}: ToolsGridProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isCreator = useAppSelector(selectIsCreator);

  // Build the tile-click handler once. Each tile's own click closure binds
  // only the tile reference; all side-effects resolve from registry + ctx.
  const activate = useCallback(
    (tile: ToolsGridTile) => {
      const ctx: TileContext = {
        dispatch,
        getState: store.getState,
        router,
      };

      try {
        if (tile.onActivate) {
          tile.onActivate(ctx);
        } else if (tile.overlayId) {
          const entry = getStaticEntryByOverlayId(tile.overlayId);
          if (!entry) {
            // eslint-disable-next-line no-console
            console.warn(
              `[ToolsGrid] tile "${tile.id}" points at overlayId "${tile.overlayId}" which is not registered`,
            );
            return;
          }
          const strategy =
            tile.instanceStrategy ??
            (entry.instanceMode === "multi"
              ? "fresh-per-click"
              : "singleton-default");

          const data = tile.seedData?.(ctx);
          const instanceId =
            strategy === "fresh-per-click"
              ? `${entry.slug}-${Date.now()}`
              : undefined;

          dispatch(
            openOverlay({
              // entry comes from the registry; cast is safe because
              // check-registry verifies every entry's overlayId is in
              // OVERLAY_IDS. The metadata field is `string` only to avoid
              // a circular import with overlay-ids.ts.
              overlayId: entry.overlayId as OverlayId,
              ...(instanceId ? { instanceId } : {}),
              ...(data ? { data } : {}),
            }),
          );
        }
      } finally {
        onAfterActivate?.();
      }
    },
    [dispatch, store, router, onAfterActivate],
  );

  // Filter categories by section + admin gate.
  const visibleCategories = TOOLS_CATEGORIES.filter((cat) => {
    // Each gated section renders only its own category.
    if (section === "admin") return cat.id === "admin" && isAdmin;
    if (section === "creator") return cat.id === "creator" && isCreator;
    // "tools" — everyday categories only; admin/creator live in their own tabs.
    if (cat.id === "admin" || cat.id === "creator") return false;
    if (cat.gate === "admin" && !isAdmin) return false;
    if (cat.gate === "creator" && !isCreator) return false;
    return true;
  });

  // Filter tiles the same way.
  const tilesByCategory = new Map<ToolsCategory, ToolsGridTile[]>();
  for (const tile of TOOLS_GRID_TILES) {
    if (tile.gate === "admin" && !isAdmin) continue;
    if (tile.gate === "creator" && !isCreator) continue;
    if (section === "admin" && tile.category !== "admin") continue;
    if (section === "creator" && tile.category !== "creator") continue;
    if (
      section === "tools" &&
      (tile.category === "admin" || tile.category === "creator")
    )
      continue;
    const bucket = tilesByCategory.get(tile.category) ?? [];
    bucket.push(tile);
    tilesByCategory.set(tile.category, bucket);
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto mt-1">
      {visibleCategories.map((cat, idx) => {
        const tiles = tilesByCategory.get(cat.id) ?? [];
        if (tiles.length === 0) return null;
        return (
          <Fragment key={cat.id}>
            {idx > 0 && <MenuDivider />}
            {/* Admin section has no "Admin" header in the legacy layout — the
                entire tab is admin. Keep the header for "tools" section only. */}
            {section === "tools" && <MenuSection label={cat.label} />}
            <div
              className={
                section === "admin" || section === "creator"
                  ? "grid grid-cols-2 gap-1.5 px-2 pb-2 mt-1"
                  : "grid grid-cols-2 gap-1.5 px-2 pb-2"
              }
            >
              {tiles.map((tile) => {
                const Icon = tile.icon;
                const entry = tile.overlayId
                  ? getStaticEntryByOverlayId(tile.overlayId)
                  : undefined;
                return (
                  <MenuGridItem
                    key={tile.id}
                    icon={<Icon className="w-3.5 h-3.5" />}
                    label={tile.label}
                    onClick={() => activate(tile)}
                    deprecated={!!entry?.deprecated}
                  />
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
