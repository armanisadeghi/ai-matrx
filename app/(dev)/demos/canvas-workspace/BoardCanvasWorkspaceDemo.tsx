"use client";

/**
 * /demos/canvas-workspace — the Board demo inside ChatCanvasWorkspace.
 *
 * The board publishes its own surface (`matrx-user/board`: values +
 * board_* agent tools), so the workspace passes no page-level snapshot of it.
 * No properties panel: the board's Layers need its store
 * outside the viewport, which the board does not expose yet — and a
 * placeholder panel would be a screen that lies.
 */

import { type DemoKindExample, BoardDemo } from "@/features/board/demo/BoardDemo";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";

const BOARD_TITLE = "Board demo board";

export function BoardCanvasWorkspaceDemo({
  workspaceId,
  kinds,
  examplesNote,
  initialLayout,
}: {
  workspaceId: string;
  kinds: DemoKindExample[];
  examplesNote: string | null;
  initialLayout: CanvasWorkspaceLayout;
}) {
  return (
    <ChatCanvasWorkspace
      id={workspaceId}
      title={BOARD_TITLE}
      byline="By you"
      initialLayout={initialLayout}
      // No getCanvasContext here: the board publishes ITSELF as the
      // `matrx-user/board` surface (its values + board_* tools reach
      // the chat on their own). A second, page-level snapshot of the same
      // board would send it twice.
      canvas={
        <div className="h-full min-h-0">
          <BoardDemo kinds={kinds} examplesNote={examplesNote} />
        </div>
      }
    />
  );
}
