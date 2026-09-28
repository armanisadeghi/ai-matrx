"use client";

/**
 * SpatialBoardSurface — makes a board an agent SURFACE. Every host wraps its
 * board in this (the demo, War Room's Board view, the meeting Board layout, a
 * workflow run's Board view, the person's own Board): it registers the
 * `matrx-user/spatial-board` runtime and the board's agent tools
 * (`useBoardAgentTools`), so any agent running while the board is on screen —
 * the chat beside it, a shortcut, a mandate — can read and change the board.
 * Inside another surface (a War Room) it stacks; the host keeps its own.
 *
 * `board_items` is REQUEST ONE of the bridge (`tools/item-surfaces.ts`): on
 * every turn it names every item — id, title, kind, surface, live — with the
 * basics of every dormant one, so an agent knows what each item is and can
 * open any of them with `board_open_item` in the same turn.
 */

import type { ReactNode } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { SPATIAL_BOARD_SURFACE_NAME } from "@/features/surfaces/manifests/spatial-board.manifest";
import type { BoardTileBase } from "../board/useBoard";
import { boardItemsOverview } from "../tools/item-surfaces";
import { type BoardToolHost, useBoardAgentTools } from "../tools/useBoardAgentTools";

export function SpatialBoardSurface<T extends BoardTileBase & { title: string }>({
  host,
  children,
}: {
  host: BoardToolHost<T>;
  children: ReactNode;
}) {
  useBoardAgentTools(SPATIAL_BOARD_SURFACE_NAME, host);
  return (
    <SurfaceRuntimeProvider
      surfaceName={SPATIAL_BOARD_SURFACE_NAME}
      getScope={async () => {
        const now = host.board.read();
        const parked = new Set(now.parked.map((t) => t.id));
        const removedTiles = now.removed ?? [];
        const removed = new Set(removedTiles.map((t) => t.id));
        const all = [...now.tiles, ...now.parked, ...removedTiles];
        // The LIVE tiles — selected, worked in or focused — are the ones
        // whose feature surface is registered for the agent right now.
        const live = new Set(
          [host.store?.getSelected(), host.store?.getEditing(), host.store?.getFocused()].filter(
            (id): id is string => typeof id === "string",
          ),
        );
        const rows = all.map((t) => {
          const described = host.describe(t);
          return {
            id: t.id,
            title: t.title,
            kind: described.kind,
            surface: described.surface ?? null,
            live: live.has(t.id),
            ...(parked.has(t.id) ? { parked: true } : {}),
            ...(removed.has(t.id) ? { removed: true } : {}),
          };
        });
        const selectedId = host.store?.getSelected() ?? null;
        const selected = rows.find((row) => row.id === selectedId);
        return {
          board_title: host.boardTitle,
          board_items: await boardItemsOverview(rows, host.itemSurfaces ?? null),
          selected_tile: selected
            ? { id: selected.id, title: selected.title, kind: selected.kind }
            : null,
        };
      }}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
