import "server-only";

import { cookies } from "next/headers";
import { parseSidePanelWidth, sidePanelWidthCookieName } from "@host/components/official/side-panel/side-panel-width";
import {
  CANVAS_CHAT_SIZES,
  CANVAS_PANEL_IDS,
  CANVAS_PROPERTIES_SIZES,
  canvasChatCookieName,
  canvasPropertiesCookieName,
  parseCanvasChatCookie,
  parseCanvasPropertiesCookie,
  type CanvasWorkspaceLayout,
} from "../../canvas/workspace/workspace-cookies";

/** Read on the server so the first paint is at the layout the person left. */
export async function readCanvasWorkspaceLayout(
  workspaceId: string,
  { defaultChatOpen = true }: { defaultChatOpen?: boolean } = {},
): Promise<CanvasWorkspaceLayout> {
  const store = await cookies();
  const width = (panelId: string, sizes: typeof CANVAS_CHAT_SIZES) =>
    parseSidePanelWidth(store.get(sidePanelWidthCookieName(panelId))?.value, sizes);
  return {
    chat: parseCanvasChatCookie(store.get(canvasChatCookieName(workspaceId))?.value, defaultChatOpen),
    propertiesOpen: parseCanvasPropertiesCookie(store.get(canvasPropertiesCookieName(workspaceId))?.value),
    widths: {
      chat: width(CANVAS_PANEL_IDS.chat, CANVAS_CHAT_SIZES),
      properties: width(CANVAS_PANEL_IDS.properties, CANVAS_PROPERTIES_SIZES),
    },
  };
}
