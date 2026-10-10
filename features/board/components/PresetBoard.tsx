"use client";

/**
 * PresetBoard — mount a saved board with a focus. The route-level door for any
 * surface that wants the Board with a preset (`presets/`): same `BoardPage`, one
 * extra prop. `<PresetBoard preset="marketing-social" boardId={id} />`.
 */

import type { ReactNode } from "react";
import { BoardPage } from "../home/BoardPage";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import { BOARD_PRESETS, presetByKey } from "../presets/registry";
import type { BoardPresetKey } from "../presets/registry";

export function PresetBoard({
  preset,
  boardId,
  workspaceId,
  initialLayout,
  titleMenuExtra,
  hideNewBoard,
}: {
  preset: BoardPresetKey;
  boardId: string;
  /** Default: `board-<boardId>` (the same workspace the plain board uses). */
  workspaceId?: string;
  initialLayout: CanvasWorkspaceLayout;
  /** Extra items for the board's own title ▾. */
  titleMenuExtra?: ReactNode;
  /** The host offers its own "New board" in `titleMenuExtra`. */
  hideNewBoard?: boolean;
}) {
  return (
    <BoardPage
      target={{ boardId }}
      workspaceId={workspaceId ?? `board-${boardId}`}
      initialLayout={initialLayout}
      titleMenuExtra={titleMenuExtra}
      hideNewBoard={hideNewBoard}
      preset={presetByKey(preset) ?? BOARD_PRESETS[preset]}
    />
  );
}
