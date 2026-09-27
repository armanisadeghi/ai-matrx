"use client";

/**
 * SpatialBoardSurface — makes a board an agent SURFACE. Every host wraps its
 * board in this (the demo, War Room's Board view, the meeting Board layout, a
 * workflow run's Board view): it registers the `matrx-user/spatial-board`
 * runtime (a compact overview as values) and the board's agent tools
 * (`useBoardAgentTools`), so any agent running while the board is on screen —
 * the chat beside it, a shortcut, a mandate — can read and change the board.
 * Inside another surface (a War Room) it stacks; the host keeps its own.
 */

import type { ReactNode } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { SPATIAL_BOARD_SURFACE_NAME } from "@/features/surfaces/manifests/spatial-board.manifest";
import type { BoardTileBase } from "../board/useBoard";
import { type BoardToolHost, useBoardAgentTools } from "../tools/useBoardAgentTools";

export function SpatialBoardSurface<T extends BoardTileBase & { title: string }>({
  host,
  children,
}: {
  host: BoardToolHost<T>;
  children: ReactNode;
}) {
  useBoardAgentTools(SPATIAL_BOARD_SURFACE_NAME, host);
  const brief = (t: T, parked: Set<string>) => ({
    id: t.id,
    title: t.title,
    kind: host.describe(t).kind,
    parked: parked.has(t.id),
  });
  return (
    <SurfaceRuntimeProvider
      surfaceName={SPATIAL_BOARD_SURFACE_NAME}
      getScope={() => {
        const now = host.board.read();
        const parked = new Set(now.parked.map((t) => t.id));
        const all = [...now.tiles, ...now.parked];
        const selectedId = host.store?.getSelected() ?? null;
        const selected = all.find((t) => t.id === selectedId);
        return {
          board_title: host.boardTitle,
          board_tiles: all.map((t) => brief(t, parked)),
          selected_tile: selected ? brief(selected, parked) : null,
        };
      }}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
