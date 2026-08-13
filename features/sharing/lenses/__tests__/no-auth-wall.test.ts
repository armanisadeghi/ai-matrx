/**
 * THE LAW OF THE RECIPIENT'S NEXT STEP, mechanically enforced.
 *
 * A share surface may never send its recipient to `/sign-up` or `/login`.
 * Everything basic here is free up front, so an auth wall at the moment a
 * prospect is impressed by shared work throws the referral away. Destinations
 * come from `../source-surface.ts`. Full rule: features/sharing/FEATURE.md.
 *
 * A doc alone did not hold this — four CTAs had already drifted to `/sign-up`
 * across two public lanes before anyone noticed (2026-08-13).
 *
 * `DuplicateToEditButton` is deliberately NOT scanned: forking a resource into
 * your own account genuinely requires an account.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

/** Surfaces a share recipient can land on. */
const SHARE_SURFACES = [
  "app/(public)/s",
  "app/(public)/p/e",
  "features/sharing/lenses",
  "features/marketing/seo/keyword-research/components/KeywordResearchReport.tsx",
  "features/marketing/seo/ai-visibility/AiVisibilityReport.tsx",
];

const AUTH_ROUTE = /["'`]\/(sign-up|login)(\?|["'`])/;

function filesUnder(relativePath: string): string[] {
  const absolute = join(REPO_ROOT, relativePath);
  const stats = statSync(absolute);
  if (!stats.isDirectory()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === "__tests__") return [];
    const child = join(relativePath, entry);
    const childStats = statSync(join(REPO_ROOT, child));
    if (childStats.isDirectory()) return filesUnder(child);
    return /\.(ts|tsx)$/.test(entry) ? [join(REPO_ROOT, child)] : [];
  });
}

describe("share surfaces never send the recipient to an auth wall", () => {
  const offenders: string[] = [];
  for (const surface of SHARE_SURFACES) {
    for (const file of filesUnder(surface)) {
      const source = readFileSync(file, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        // Comments explain the rule; only real code counts.
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (AUTH_ROUTE.test(line)) {
          offenders.push(
            `${file.replace(`${REPO_ROOT}/`, "")}:${index + 1} — ${line.trim()}`,
          );
        }
      }
    }
  }

  it("has no /sign-up or /login destination", () => {
    expect(offenders).toEqual([]);
  });
});
