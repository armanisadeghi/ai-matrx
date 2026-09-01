// utils/supabase/server.ts — the Server Component / Server Action client.
//
// The cookie adapter (including the write that MUST be swallowed inside a
// Server Component — only the proxy may set cookies there) lives in
// @ai-matrx/data/next. This file supplies the two Next primitives the package
// deliberately does not import: the cookie store and the request host.

import { cookies, headers } from "next/headers";
import { supabaseNext } from "@/utils/supabase/authCookie";

export async function createClient() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  return supabaseNext.serverClient({
    cookieStore,
    host: requestHeaders.get("host"),
    // The RAW header: `cookies()` has already collapsed two same-name cookies
    // at two Domain scopes into one, keeping whichever the browser sent last
    // — a coin flip between the session and anonymous.
    cookieHeader: requestHeaders.get("cookie"),
  });
}
