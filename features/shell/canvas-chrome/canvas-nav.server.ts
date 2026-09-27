import "server-only";

import { cookies } from "next/headers";
import { CANVAS_NAV_COOKIE, parseCanvasNavCookie, type CanvasNavPersisted } from "./canvas-nav-cookie";

/** Server read of the canvas nav state, so the first paint is right. */
export async function readCanvasNavCookie(): Promise<CanvasNavPersisted> {
  const store = await cookies();
  return parseCanvasNavCookie(store.get(CANVAS_NAV_COOKIE)?.value);
}
