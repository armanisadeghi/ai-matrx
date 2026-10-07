/**
 * features/files/utils/server-cookies.ts
 *
 * SSR-side readers for cloud-files preference cookies. Used by the route
 * pages to pass the user's persisted sidebar mode into the shell so there's
 * no mode flash on first paint.
 */

import { cookies } from "next/headers";
import { SIDEBAR_MODE_COOKIE } from "@/features/files/components/surfaces/desktop/sidebarModeCookie";
import type { SidebarMode } from "@/features/files/components/surfaces/desktop/SidebarModeToggle";

export async function readSidebarModeCookie(): Promise<SidebarMode> {
  const store = await cookies();
  const value = store.get(SIDEBAR_MODE_COOKIE)?.value;
  return value === "tree" ? "tree" : "flat";
}
