import "server-only";

import { cookies } from "next/headers";
import { parseSidePanelWidth, sidePanelWidthCookieName } from "@ai-matrx/chat/ui/side-panel-width";
import {
  CANVAS_PANEL_IDS,
  CANVAS_PROPERTIES_SIZES,
  canvasPropertiesCookieName,
  parseCanvasPropertiesCookie,
  type CanvasWorkspaceLayout,
} from "../../canvas/workspace/workspace-cookies";

/**
 * Read on the server so the first paint is at the layout the person left.
 * The chat's own layout is the shell chat's (AppShell reads it per home).
 */
export async function readCanvasWorkspaceLayout(workspaceId: string): Promise<CanvasWorkspaceLayout> {
  const store = await cookies();
  return {
    propertiesOpen: parseCanvasPropertiesCookie(store.get(canvasPropertiesCookieName(workspaceId))?.value),
    widths: {
      properties: parseSidePanelWidth(
        store.get(sidePanelWidthCookieName(CANVAS_PANEL_IDS.properties))?.value,
        CANVAS_PROPERTIES_SIZES,
      ),
    },
  };
}
