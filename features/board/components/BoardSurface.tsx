"use client";

/**
 * BoardSurface — makes a board an agent SURFACE. Every host wraps its
 * board in this (the demo, War Room's Board view, the meeting Board layout, a
 * workflow run's Board view, the person's own Board): it registers the
 * `matrx-user/board` runtime and the board's agent tools
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
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { BOARD_SURFACE_NAME } from "@/features/surfaces/manifests/board.manifest";
import type { BoardTileBase } from "../board/useBoard";
import { boardItemsOverview } from "../tools/item-surfaces";
import { ItemSurfaceIndexContext } from "../tools/TileSurfaceCapture";
import { type BoardToolHost, useBoardAgentTools } from "../tools/useBoardAgentTools";

export function BoardSurface<T extends BoardTileBase & { title: string }>({
  host,
  children,
}: {
  host: BoardToolHost<T>;
  children: ReactNode;
}) {
  useBoardAgentTools(BOARD_SURFACE_NAME, host);
  return (
    <SurfaceRuntimeProvider
      surfaceName={BOARD_SURFACE_NAME}
      getScope={async () => {
        const now = host.board.read();
        const parked = new Set(now.parked.map((t) => t.id));
        const removedTiles = now.removed ?? [];
        const removed = new Set(removedTiles.map((t) => t.id));
        const all = [...now.tiles, ...now.parked, ...removedTiles];
        // THE live tile — focused, else worked in, else selected (`useIsLiveTile`) — is the one
        // whose feature surface is registered for the agent right now. The selected tile may be a
        // different one (the person works in another): it is marked `selected` and carries its
        // full values in `board_items`.
        // With SEVERAL selected none is live by selection alone: each is marked `selected`, and only
        // a lone selected tile carries its full values (`boardItemsOverview`).
        const selectedId = host.store?.getSelected() ?? null;
        const selection = new Set(host.store?.getSelection() ?? []);
        const liveId = host.store?.getFocused() ?? host.store?.getEditing() ?? selectedId;
        const rows = all.map((t) => {
          const described = host.describe(t);
          return {
            id: t.id,
            title: t.title,
            kind: described.kind,
            surface: described.surface ?? null,
            live: t.id === liveId,
            stored_basics: host.storedBasics?.(t) ?? null,
            ...(selection.has(t.id) ? { selected: true } : {}),
            ...(parked.has(t.id) ? { parked: true } : {}),
            ...(removed.has(t.id) ? { removed: true } : {}),
          };
        });
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
      <ItemSurfaceIndexContext.Provider value={host.itemSurfaces ?? null}>{children}</ItemSurfaceIndexContext.Provider>
    </SurfaceRuntimeProvider>
  );
}
