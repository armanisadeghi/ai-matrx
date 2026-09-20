/**
 * 🚨 F-106 (class guard) — NO PAGE-LOCAL SITE QUICK-VIEW PANEL, ANYWHERE UNDER
 * `features/marketing`.
 *
 * Round 8 (F-93) ruled that a site opens in ONE overlay-owned panel from
 * loading to loaded. Two callers under `features/marketing` violated this the
 * same way (the U-C4 class): each held its own `peeking` row state and mounted
 * its own inline `SitePeekWindow` — a `WindowPanel` with no `overlayId` and no
 * address — instead of the addressed `siteQuickViewWindow` overlay
 * (`useOpenSiteQuickViewWindow`).
 *
 *   - `components/sites/SitesPortfolio.tsx` (fixed first; see the sibling
 *     guard `components/sites/__tests__/quick-view-opens-the-one-overlay.test.tsx`)
 *   - `content-plan/components/PlanSitesList.tsx` (fixed alongside this test)
 *
 * `SitePeekWindow.tsx`/`SitePeekWindowImpl.tsx` were deleted once both callers
 * were switched over (a repo-wide census turned up no other importer). This
 * test is the CLASS guard: it fails on ANY future file under
 * `features/marketing` that imports a `SitePeekWindow`/`SitePeekWindowImpl`
 * module (whether or not that module happens to exist), so a regression that
 * reintroduces a page-local panel — anywhere in this feature, not just the
 * two callers found this round — is caught by name.
 *
 * RED before this fix (on the pre-F-106 tree): `content-plan/components/PlanSitesList.tsx`
 * imports `SitePeekWindow` — the census finds it.
 * RED again if you delete this test's own file-walk exclusion for itself: it
 * would flag its own doc comment as a false positive, which is why the
 * pattern below only matches an actual `from "...SitePeekWindow(Impl)?"`
 * import/require specifier, never prose.
 */

import fs from "node:fs";
import path from "node:path";

const FEATURE_ROOT = path.resolve(__dirname, "..");
const SELF = path.resolve(__filename);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Matches an actual import/require specifier, e.g.
//   import SitePeekWindow from "@/features/marketing/components/sites/SitePeekWindow";
//   import SitePeekWindowImpl from "./SitePeekWindowImpl";
// but never a bare word inside a comment or string of prose (those never sit
// inside `from "..."` / `require("...")`).
const IMPORT_SPECIFIER_PATTERN =
  /(?:from\s+|require\()\s*["'][^"']*\/SitePeekWindow(?:Impl)?["']/;

describe("no page-local SitePeekWindow mount under features/marketing", () => {
  it("finds zero import specifiers for the retired page-local panel host", () => {
    const files = collectSourceFiles(FEATURE_ROOT).filter(
      (file) => path.resolve(file) !== SELF,
    );
    const offenders = files
      .filter((file) => IMPORT_SPECIFIER_PATTERN.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(FEATURE_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
