import "server-only";

import { cookies } from "next/headers";
import { parseSidePanelWidth, sidePanelWidthCookieName } from "@/components/official/side-panel/side-panel-width";
import {
  CHAT_DOCK_OPEN_COOKIE,
  CHAT_DOCK_PAGE_CONTEXT_COOKIE,
  CHAT_DOCK_PANEL_ID,
  CHAT_DOCK_SIZES,
  parseChatDockFollowsPage,
  parseChatDockOpen,
  type ChatDockInitial,
} from "./chat-dock-cookie";

/** The dock as the person left it — read on the server so the first paint is right. */
export async function readChatDockInitial(): Promise<ChatDockInitial> {
  const store = await cookies();
  return {
    open: parseChatDockOpen(store.get(CHAT_DOCK_OPEN_COOKIE)?.value),
    width: parseSidePanelWidth(store.get(sidePanelWidthCookieName(CHAT_DOCK_PANEL_ID))?.value, CHAT_DOCK_SIZES),
    followsPage: parseChatDockFollowsPage(store.get(CHAT_DOCK_PAGE_CONTEXT_COOKIE)?.value),
  };
}
