"use client";

/**
 * A tile's surface capture for a board whose tiles are not `UserBoard` items (the War Room board,
 * a workflow run's board): the one piece every host needs so the bridge (`item-surfaces.ts`) can
 * reach the tile's feature surface, live or dormant.
 *
 * `BoardSurface` provides the board's `ItemSurfaceIndex` through context; a tile wraps the body
 * that mounts a feature surface in this. Only the `active` (live) tile registers globally, every
 * other copy is dormant but still captured — the same law `UserBoard`'s tiles keep.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SurfaceActivity, createSurfaceCapture } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import type { ItemSurfaceIndex } from "./item-surfaces";

export const ItemSurfaceIndexContext = createContext<ItemSurfaceIndex | null>(null);

export function TileSurfaceCapture({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  const index = useContext(ItemSurfaceIndexContext);
  const [capture] = useState(createSurfaceCapture);
  useEffect(() => index?.set(id, capture), [index, id, capture]);
  return (
    <SurfaceActivity active={active} capture={capture}>
      {children}
    </SurfaceActivity>
  );
}
