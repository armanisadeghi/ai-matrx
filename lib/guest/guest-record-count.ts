// lib/guest/guest-record-count.ts — how many records THIS browser's guest holds (lane F12, guest data).
//
// Read by the sign-up and login pages so a guest who arrives from the Applet's account line is told, in one
// line, that their records come with them. Reads the guest's OWN session cookie (never the main one) and
// asks `app.guest_save_status` as that guest, so the number is the same one the Applet's account line shows.
// Never throws: no guest, an unreadable session, or zero records answers 0 and the page says nothing.
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { GUEST_AUTH_COOKIE, isGuestAuthCookie } from "@/lib/guest/guest-cookie";

export async function readGuestRecordCount(): Promise<number> {
  const jar = await cookies();
  if (!jar.getAll().some((c) => isGuestAuthCookie(c.name))) return 0;
  try {
    const guest = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      {
        cookieOptions: { name: GUEST_AUTH_COOKIE },
        cookies: { getAll: () => jar.getAll(), setAll: () => undefined },
      },
    );
    const { data: claims } = await guest.auth.getClaims();
    if ((claims?.claims as { is_anonymous?: boolean } | undefined)?.is_anonymous !== true) return 0;
    const { data, error } = await guest.schema("app").rpc("guest_save_status", {});
    if (error) {
      console.error("[guest-record-count] LOUD: the guest's record count could not be read:", error.message);
      return 0;
    }
    const saved = Number((data as { saved?: unknown } | null)?.saved);
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch (err) {
    console.error("[guest-record-count] LOUD: the guest's record count could not be read:", err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/** The one line the auth pages show; null when there is nothing to carry over. */
export function guestRecordsNote(count: number): string | null {
  return count > 0 ? `Your ${count} ${count === 1 ? "record comes" : "records come"} with you.` : null;
}
