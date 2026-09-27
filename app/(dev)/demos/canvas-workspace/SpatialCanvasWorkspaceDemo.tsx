"use client";

/**
 * /demos/canvas-workspace — the spatial demo board inside ChatCanvasWorkspace.
 *
 * The board publishes its own surface (`matrx-user/spatial-board`: values +
 * board_* agent tools), so the workspace passes no page-level snapshot of it.
 * No properties panel: the board's Layers need its store
 * outside the viewport, which the board does not expose yet — and a
 * placeholder panel would be a screen that lies.
 */

import { type DemoKindExample, SpatialDemoBoard } from "@/features/spatial/demo/SpatialDemoBoard";
import { ChatCanvasWorkspace } from "@/features/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasWorkspaceLayout } from "@/features/canvas/workspace/workspace-cookies";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

const BOARD_TITLE = "Spatial view demo board";

export function SpatialCanvasWorkspaceDemo({
  workspaceId,
  kinds,
  examplesNote,
  initialLayout,
  initialMode,
}: {
  workspaceId: string;
  kinds: DemoKindExample[];
  examplesNote: string | null;
  initialLayout: CanvasWorkspaceLayout;
  initialMode: ComposerMode | null;
}) {
  return (
    <ChatCanvasWorkspace
      id={workspaceId}
      title={BOARD_TITLE}
      byline="By you"
      initialLayout={initialLayout}
      initialMode={initialMode}
      // No getCanvasContext here: the board publishes ITSELF as the
      // `matrx-user/spatial-board` surface (its values + board_* tools reach
      // the chat on their own). A second, page-level snapshot of the same
      // board would send it twice.
      canvas={
        <div className="h-full min-h-0">
          <SpatialDemoBoard kinds={kinds} examplesNote={examplesNote} />
        </div>
      }
    />
  );
}
