// A FAILED READ IS NEVER AN EMPTY LIST.
//
// THE USE CASE: Harbor Point Dental Group runs three practices as three
// organizations. When the office manager opens her organizations page and the
// read fails — an expired token, a network blip, RLS refusing — the screen used
// to say "No organizations yet" and offer her a Create button. She would have
// made a fourth organization to replace the three she already had.
//
// So this file pins four things about the path, and the fourth is the one that
// keeps being lost in a refactor: the ERROR branch is rendered BEFORE the
// empty-state branch. An error branch that sits after `organizations.length
// === 0` is exactly the original defect with extra code in it.
//
// 2026-09-21: the launcher's destructure was pinned here as an exact source
// line, and lane ORG-ARCHIVE broke it by renaming the bound list to
// `allOrganizations` so the archived rows could be split out — a legitimate
// change to the code that this test called a regression. The assertions below
// read the source with whitespace collapsed and pin the CONTRACT (which values
// the launcher takes from the hook, what it renders, in what order), never a
// formatting choice.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const collapse = (s: string) => s.replace(/\s+/g, " ");

describe("organization list failure contract", () => {
  const hooksSource = collapse(
    readFileSync(join(process.cwd(), "features/organizations/hooks.ts"), "utf8"),
  );
  const serviceSource = readFileSync(
    join(process.cwd(), "features/organizations/service.ts"),
    "utf8",
  );
  const launcherSource = collapse(
    readFileSync(
      join(process.cwd(), "app/(core)/organizations/page.tsx"),
      "utf8",
    ),
  );

  it("waits for a browser token before it decides the list is empty", () => {
    expect(hooksSource).toContain(
      "authReady && Boolean(userId) && Boolean(accessToken)",
    );
  });

  it("lets a failed members read throw instead of swallowing it", () => {
    expect(serviceSource).toContain(
      "throw new Error(membersResult.error.message)",
    );
    expect(serviceSource).not.toContain(
      "Silently handle if organizations table doesn't exist yet",
    );
  });

  it("takes the error AND the retry from the hook, not just the rows", () => {
    // Whatever the list itself is bound to (ORG-ARCHIVE renamed it), the
    // launcher has to hold the failure and the way out of it.
    expect(launcherSource).toMatch(/error, refresh, \} = useUserOrganizations\(/);
    expect(launcherSource).toContain("We couldn&apos;t load your organizations");
    expect(launcherSource).toContain("onClick={refresh}");
  });

  it("renders the failure BEFORE it can ever render the empty state", () => {
    const failure = launcherSource.indexOf(
      "We couldn&apos;t load your organizations",
    );
    const emptyState = launcherSource.indexOf("No organizations yet");
    expect(failure).toBeGreaterThan(-1);
    expect(emptyState).toBeGreaterThan(-1);
    expect(failure).toBeLessThan(emptyState);
    // And the branch that reaches the empty state is guarded by `error`
    // first — not a second, independent conditional somewhere below it.
    expect(launcherSource).toMatch(
      /: error \? \(.*organizations\.length === 0 \?/,
    );
  });
});
