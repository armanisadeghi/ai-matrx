import "server-only";

import { cookies } from "next/headers";
import { parseSidePanelWidth, sidePanelWidthCookieName, type SidePanelSizes } from "./side-panel-width";

/** Server read of a docked panel's remembered width, so the first paint is right. */
export async function readSidePanelWidth(panelId: string, sizes: SidePanelSizes): Promise<number> {
  const store = await cookies();
  return parseSidePanelWidth(store.get(sidePanelWidthCookieName(panelId))?.value, sizes);
}
