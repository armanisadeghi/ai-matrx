import "server-only";

import { cookies } from "next/headers";
import { parseSidePanelWidth, sidePanelWidthCookieName } from "@/components/official/side-panel/side-panel-width";
import { CANVAS_NAV_COOKIE, parseCanvasNavCookie } from "@/features/shell/canvas-chrome/canvas-nav-cookie";
import {
  CANVAS_CHAT_SIZES,
  CANVAS_NAV_SIZES,
  CANVAS_PANEL_IDS,
  CANVAS_PROPERTIES_SIZES,
  canvasChatCookieName,
  canvasFollowsPageCookieName,
  canvasPropertiesCookieName,
  parseCanvasChatCookie,
  parseCanvasPropertiesCookie,
  type CanvasWorkspaceLayout,
} from "./workspace-cookies";

/** Read on the server so the first paint is at the layout the person left. */
export async function readCanvasWorkspaceLayout(
  workspaceId: string,
  { defaultChatOpen = true }: { defaultChatOpen?: boolean } = {},
): Promise<CanvasWorkspaceLayout> {
  const store = await cookies();
  const width = (panelId: string, sizes: typeof CANVAS_NAV_SIZES) =>
    parseSidePanelWidth(store.get(sidePanelWidthCookieName(panelId))?.value, sizes);
  return {
    nav: parseCanvasNavCookie(store.get(CANVAS_NAV_COOKIE)?.value),
    chat: parseCanvasChatCookie(store.get(canvasChatCookieName(workspaceId))?.value, defaultChatOpen),
    propertiesOpen: parseCanvasPropertiesCookie(store.get(canvasPropertiesCookieName(workspaceId))?.value),
    followsPage: store.get(canvasFollowsPageCookieName(workspaceId))?.value !== "off",
    widths: {
      nav: width(CANVAS_PANEL_IDS.nav, CANVAS_NAV_SIZES),
      chat: width(CANVAS_PANEL_IDS.chat, CANVAS_CHAT_SIZES),
      properties: width(CANVAS_PANEL_IDS.properties, CANVAS_PROPERTIES_SIZES),
    },
  };
}
