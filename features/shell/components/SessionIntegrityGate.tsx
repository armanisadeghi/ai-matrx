/**
 * SessionIntegrityGate — the server half of the split-session notice.
 *
 * Reads the one signal the proxy stamps on the request (`x-matrx-split-jar`,
 * set from `MiddlewareSession.splitCookieJar` in `utils/supabase/middleware.ts`)
 * and hands it, with the server's own view of who is signed in, to the client
 * banner that compares the two. Server Component: `headers()` cannot be read
 * from `AppShell`, which is synchronous.
 *
 * See `SessionIntegrityBanner.tsx` for what this exists to stop.
 */

import { headers } from "next/headers";
import SessionIntegrityBanner from "./SessionIntegrityBanner";

export default async function SessionIntegrityGate({
  serverAuthenticated,
}: {
  serverAuthenticated: boolean;
}) {
  // A signed-in server render has no split to report; skip the header read.
  if (serverAuthenticated) return null;
  const headersList = await headers();
  return (
    <SessionIntegrityBanner
      serverAuthenticated={false}
      splitCookieJar={headersList.get("x-matrx-split-jar") === "1"}
    />
  );
}
