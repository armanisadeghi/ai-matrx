// utils/supabase/server.ts — the Server Component / Server Action client.
//
// The cookie adapter (including the write that MUST be swallowed inside a
// Server Component — only the proxy may set cookies there) lives in
// @ai-matrx/data/next. This file supplies the two Next primitives the package
// deliberately does not import: the cookie store and the request host.

import { cookies, headers } from "next/headers";
import { supabaseNext } from "@/utils/supabase/authCookie";
import { ADMIN_LANE_HEADER, installAdminLane } from "@/utils/supabase/adminLane";

export async function createClient() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const client = supabaseNext.serverClient({
    cookieStore,
    host: requestHeaders.get("host"),
    // The RAW header: `cookies()` has already collapsed two same-name cookies
    // at two Domain scopes into one, keeping whichever the browser sent last
    // — a coin flip between the session and anonymous.
    cookieHeader: requestHeaders.get("cookie"),
  });
  // THE ADMIN LANE (utils/supabase/adminLane.ts). `proxy.ts` stamps this
  // request header on /administration/** and /api/admin/** and STRIPS it
  // everywhere else, so a Server Component, Server Action or Route Handler
  // rides the lane exactly when the request it serves is in the admin section.
  const laneOpen = requestHeaders.get(ADMIN_LANE_HEADER) === "1";
  return installAdminLane(client, () => laneOpen);
}
