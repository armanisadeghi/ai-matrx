import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { getStaticEntryByOverlayId } from "@/features/window-panels/registry/windowRegistryMetadata";
import {
  TOOLS_GRID_TILES,
  type TileContext,
  type ToolsGridTile,
} from "./toolsGridTiles";

function findTile(tileId: string): ToolsGridTile | undefined {
  return TOOLS_GRID_TILES.find((t) => t.id === tileId);
}

/** Shared activation path for ToolsGrid tiles and shell nav panel actions. */
export function activateToolsGridTile(
  tileId: string,
  ctx: TileContext,
): boolean {
  const tile = findTile(tileId);
  if (!tile) {
    // eslint-disable-next-line no-console
    console.warn(`[ToolsGrid] unknown tile id "${tileId}"`);
    return false;
  }

  if (tile.onActivate) {
    tile.onActivate(ctx);
    return true;
  }

  if (!tile.overlayId) return false;

  const entry = getStaticEntryByOverlayId(tile.overlayId);
  if (!entry) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ToolsGrid] tile "${tile.id}" points at overlayId "${tile.overlayId}" which is not registered`,
    );
    return false;
  }

  const strategy =
    tile.instanceStrategy ??
    (entry.instanceMode === "multi" ? "fresh-per-click" : "singleton-default");

  const data = tile.seedData?.(ctx);
  const instanceId =
    strategy === "fresh-per-click" ? `${entry.slug}-${Date.now()}` : undefined;

  ctx.dispatch(
    openOverlay({
      overlayId: entry.overlayId as OverlayId,
      ...(instanceId ? { instanceId } : {}),
      ...(data ? { data } : {}),
    }),
  );
  return true;
}
