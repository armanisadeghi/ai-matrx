/**
 * SessionIntegrityGate — the server half of the split-session notice.
 *
 * Mounted ONCE, in `app/layout.tsx`, so every route group inherits it. The
 * first attempt mounted it inside `AppShell`, which covers `(core)` and
 * `(admin)` and nothing else — a screen that lies is not a `(core)` problem.
 *
 * Resolves the server's own view of the user (request-cached, so this costs no
 * extra round-trip) and reads the one signal the proxy stamps when it saw the
 * auth cookie at two Domain scopes (`x-matrx-split-jar`, set from
 * `MiddlewareSession.splitCookieJar` in `utils/supabase/middleware.ts`), then
 * hands both to the client banner that compares them.
 *
 * See `SessionIntegrityBanner.tsx` for what this exists to stop.
 */

import { headers } from "next/headers";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import SessionIntegrityBanner from "./SessionIntegrityBanner";

export default async function SessionIntegrityGate() {
  const { isAuthenticated } = await getServerAuth();
  // A signed-in server render has no split to report.
  if (isAuthenticated) return null;
  const headersList = await headers();
  return (
    <SessionIntegrityBanner
      splitCookieJar={headersList.get("x-matrx-split-jar") === "1"}
    />
  );
}
