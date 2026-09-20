import "server-only";

// features/unified-data/test-bench/routesInThisBuild.ts
//
// DOES THIS BUILD SERVE THAT ADDRESS? — asked of the App Router's own directory
// tree, which is the only thing that decides it.
//
// The try-everything page used to answer this question from a sentence somebody
// typed. On 2026-09-20 a verifier read "there is no portal address to give
// anybody" on a deployment that serves `/portal/c/<slug>`, four portal pages and
// a Portals panel — and wrote the line that made this file exist: "a person who
// believes the page will not press the buttons that work."
//
// So no section on that page states a route's existence any more. It asks here,
// and `null` is a THIRD answer: we could not read the tree, which is said out
// loud rather than reported as absence.
//
// The same filesystem read already runs in production for the route index pages
// (`utils/route-discovery`, mounted by `app/(transitional)/registered-results`),
// so this is the deployment's own established way of asking.

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { isPageFile } from "@/utils/route-discovery/scan-fs";

// The SHAPE lives next door, in a file with no `server-only` in it, so the
// client screen can name the type it is handed without pulling this module
// into the browser bundle.
import type { RoutesInThisBuild } from "./routeFacts";

async function hasPage(segments: readonly string[]): Promise<boolean | null> {
  try {
    const entries = await readdir(join(process.cwd(), "app", ...segments));
    return entries.some((name) => isPageFile(name));
  } catch {
    // Unreadable is NOT absent. A missing directory and a sandbox that will not
    // let us look are different facts and a person is told which one this is.
    return null;
  }
}

export async function routesInThisBuild(): Promise<RoutesInThisBuild> {
  const [portal, publicForm] = await Promise.all([
    hasPage(["(portal)", "portal", "c", "[slug]"]),
    hasPage(["(link)", "f", "[formId]"]),
  ]);
  return {
    portal: { path: "/portal/c/<the client's own address>", there: portal },
    publicForm: { path: "/f/<the form's own id>", there: publicForm },
  };
}
