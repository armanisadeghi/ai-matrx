/**
 * features/shell/utils/server-cookies.ts
 *
 * SSR-side reader for shell preference cookies. Used by the shell layouts so
 * the sidebar renders in its persisted expanded/collapsed state on first paint
 * — no flash, no hydration mismatch.
 */

import { cookies } from "next/headers";
import { SHELL_SIDEBAR_COOKIE } from "@/features/shell/constants/sidebar-cookie";

export async function readSidebarExpandedCookie(): Promise<boolean> {
  const store = await cookies();
  return store.get(SHELL_SIDEBAR_COOKIE)?.value === "1";
}
