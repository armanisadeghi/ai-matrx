import "server-only";

import { cookies } from "next/headers";
import { canvasChatCookieName, parseCanvasChatCookie, type CanvasChatPlacement } from "./workspace-cookies";

/** Server read of a workspace's chat placement, so the first paint is right. */
export async function readCanvasChatCookie(workspaceId: string): Promise<CanvasChatPlacement> {
  const store = await cookies();
  return parseCanvasChatCookie(store.get(canvasChatCookieName(workspaceId))?.value);
}
