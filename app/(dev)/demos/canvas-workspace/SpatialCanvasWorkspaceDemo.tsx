"use client";

/**
 * /demos/canvas-workspace — the spatial demo board inside ChatCanvasWorkspace.
 *
 * The board exposes no store handle yet, so its context is read from its DOM
 * (`readBoardContextFromDom`) and reaches the agent as the ONE `spatial_board`
 * context entry. No properties panel: the board's Layers need its store
 * outside the viewport, which the board does not expose yet — and a
 * placeholder panel would be a screen that lies.
 */

import { useRef, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { type DemoKindExample, SpatialDemoBoard } from "@/features/spatial/demo/SpatialDemoBoard";
import { BOARD_CONTEXT_KEY, boardContextEntry, readBoardContextFromDom } from "@/features/spatial/chat/board-context";
import { toast } from "@/lib/toast";
import { ChatCanvasWorkspace } from "@/features/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasNavPersisted } from "@/features/shell/canvas-chrome/canvas-nav-cookie";
import type { CanvasChatPlacement } from "@/features/canvas/workspace/workspace-cookies";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

const BOARD_TITLE = "Spatial view demo board";

export function SpatialCanvasWorkspaceDemo({
  workspaceId,
  kinds,
  examplesNote,
  initialNav,
  initialChat,
  initialMode,
}: {
  workspaceId: string;
  kinds: DemoKindExample[];
  examplesNote: string | null;
  initialNav: CanvasNavPersisted;
  initialChat: CanvasChatPlacement;
  initialMode: ComposerMode | null;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [tileCount, setTileCount] = useState<number | null>(null);

  const readBoard = () => readBoardContextFromDom(boardRef.current, BOARD_TITLE);

  return (
    <ChatCanvasWorkspace
      id={workspaceId}
      title={BOARD_TITLE}
      byline="By you"
      initialNav={initialNav}
      initialChat={initialChat}
      initialMode={initialMode}
      getCanvasContext={() => {
        const snapshot = readBoard();
        if (snapshot.tileCount !== tileCount) setTileCount(snapshot.tileCount);
        return boardContextEntry(snapshot);
      }}
      contextChip={{
        id: "spatial-board",
        contextKey: BOARD_CONTEXT_KEY,
        icon: LayoutDashboard,
        label: `Board: ${BOARD_TITLE}`,
        word: "Board",
        detail: tileCount === null ? undefined : `${tileCount} tile${tileCount === 1 ? "" : "s"}`,
        hint: "The agent sees this board with every message. Click to see what it is sent.",
        onOpen: () => {
          const snapshot = readBoard();
          const names = snapshot.tiles.map((tile) => tile.title).join(", ");
          toast.info(
            `The agent sees ${snapshot.tiles.length} of ${snapshot.tileCount} tiles${
              snapshot.omittedTileCount > 0 ? ` (${snapshot.omittedTileCount} left out to keep it short)` : ""
            }${names ? `: ${names}` : ""}.`,
          );
        },
      }}
      canvas={
        <div ref={boardRef} className="h-full min-h-0">
          <SpatialDemoBoard kinds={kinds} examplesNote={examplesNote} />
        </div>
      }
    />
  );
}
