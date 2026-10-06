// features/spaces/page/leave-save.ts — the last edits are never lost when the tab closes.
//
// The autosave waits a moment after the last change; a tab closed inside that moment would drop what was
// typed. On the way out (pagehide) the host sends the page through the same door (`content.space_save`,
// compare-and-swap on the version) as a keepalive request — the browser finishes it after the tab is gone —
// and the page is kept on this device first (page/unsaved.ts), so a request that does not land is put back
// on the next open ("Unsaved changes restored").

import { supabase } from "@/utils/supabase/client";
import { spaceSaveArgs } from "../store-db/supabase-store";

import type { SpaceDoc } from "../contract";

/** Browsers refuse keepalive bodies past 64 KiB in flight; a larger page relies on the device copy. */
export const KEEPALIVE_LIMIT = 60_000;

let accessToken: string | null = null;
let tracking = false;

/** Keep the signed-in person's access token at hand: a page being torn down cannot wait for a read. */
export function trackAccessToken(): void {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  void supabase.auth.getSession().then(({ data }) => {
    accessToken = data.session?.access_token ?? accessToken;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });
}

export interface LeaveRequest {
  url: string;
  init: RequestInit & { keepalive: true };
}

/** The keepalive request for a save — null when it cannot go (no sign-in, no endpoint, too large). */
export function leaveSaveRequest(args: {
  doc: SpaceDoc;
  baseVersion: number;
  endpoint: string | undefined;
  apiKey: string | undefined;
  token: string | null;
}): LeaveRequest | null {
  const { doc, baseVersion, endpoint, apiKey, token } = args;
  if (!endpoint || !apiKey || !token) return null;
  const body = JSON.stringify(spaceSaveArgs(doc, baseVersion));
  if (body.length > KEEPALIVE_LIMIT) return null;
  return {
    url: `${endpoint.replace(/\/$/, "")}/rest/v1/rpc/space_save`,
    init: {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "content",
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
      body,
    },
  };
}

/** Send the page as the tab goes. Answers whether a request left (its answer is never awaited). */
export function sendOnLeave(doc: SpaceDoc, baseVersion: number): boolean {
  const request = leaveSaveRequest({
    doc,
    baseVersion,
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL,
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    token: accessToken,
  });
  if (!request) return false;
  try {
    void fetch(request.url, request.init).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
