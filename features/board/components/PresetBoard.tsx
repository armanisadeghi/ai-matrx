"use client";

/**
 * PresetBoard — mount a saved board with a focus. The route-level door for any
 * surface that wants the Board with a preset (`presets/`): same `BoardPage`, one
 * extra prop. `<PresetBoard preset="marketing-social" boardId={id} />`.
 */

import { BoardPage } from "../home/BoardPage";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import { BOARD_PRESETS, presetByKey } from "../presets/registry";
import type { BoardPresetKey } from "../presets/registry";

export function PresetBoard({
  preset,
  boardId,
  workspaceId,
  initialLayout,
}: {
  preset: BoardPresetKey;
  boardId: string;
  /** Default: `board-<boardId>` (the same workspace the plain board uses). */
  workspaceId?: string;
  initialLayout: CanvasWorkspaceLayout;
}) {
  return (
    <BoardPage
      target={{ boardId }}
      workspaceId={workspaceId ?? `board-${boardId}`}
      initialLayout={initialLayout}
      preset={presetByKey(preset) ?? BOARD_PRESETS[preset]}
    />
  );
}
