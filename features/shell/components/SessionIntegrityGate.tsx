/**
 * SessionIntegrityGate — the server half of the split-session notice.
 *
 * Mounted ONCE, in `app/layout.tsx`, so every route group inherits it. The
 * first attempt mounted it inside `AppShell`, which covers `(core)` and
 * `(admin)` and nothing else — a screen that lies is not a `(core)` problem.
 *
 * Resolves the server's own view of the user (request-cached, so this costs no
 * extra round-trip) and reads the one signal the proxy stamps when it saw the
 * auth cookie at two Domain scopes (`x-matrx-split-jar`, stamped by
 * `@ai-matrx/data/next` on every healed response), then hands both to the
 * client banner that compares them.
 *
 * See `SessionIntegrityBanner.tsx` for what this exists to stop.
 */

import { headers } from "next/headers";
import {
  AMBIGUOUS_AUTH_COOKIE_HEADER,
  SPLIT_COOKIE_JAR_HEADER,
} from "@ai-matrx/data/next";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import SessionIntegrityBanner from "./SessionIntegrityBanner";

export default async function SessionIntegrityGate() {
  const { isAuthenticated } = await getServerAuth();
  // A signed-in server render has no split to report.
  if (isAuthenticated) return null;
  const headersList = await headers();
  return (
    <SessionIntegrityBanner
      // The header NAME comes from the package that stamps it (0.8.2 exported
      // it for exactly this) — a literal here silently reads `false` forever
      // the day the package renames it.
      splitCookieJar={headersList.get(SPLIT_COOKIE_JAR_HEADER) === "1"}
      // We SIGNED THIS PERSON OUT on this request, on purpose: their jar held
      // one auth cookie both unchunked and chunked, and serving either copy
      // risks serving somebody else's session. The banner must show for this
      // even though the tab has no session left to detect — that is exactly
      // what makes it invisible otherwise (2026-09-08, R-O3).
      ambiguousAuthCookies={
        headersList.get(AMBIGUOUS_AUTH_COOKIE_HEADER) === "1"
      }
    />
  );
}
