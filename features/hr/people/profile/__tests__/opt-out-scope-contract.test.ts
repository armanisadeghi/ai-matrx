// features/hr/people/profile/__tests__/opt-out-scope-contract.test.ts
//
// 🚨 `directory_opt_out` IS A BROWSING CONTROL, NOT AN IDENTITY SEAL — ruled
// 2026-08-27, and pinned here because the obvious "improvement" breaks real work.
//
// The column's own name scopes it. **Not-findable** is the promise, and it is kept in
// three places that already work:
//
//   • `hr_directory_list` drops the row for a peer (measured: 9 against 10);
//   • `hr_org_chart` withholds the NAME while the node and its reports stay, so the
//     tree does not develop a person-shaped hole that says who is missing;
//   • no browsing surface publishes the id — the chart's "N reports" link used to
//     carry `managerEmployeeId` and no longer does.
//
// A profile reached by a legitimately-held id — a report opening their own manager, a
// workflow step's door, a link from somebody's own queue — still shows directory-tier
// identity under §4.2's own field rules. **People who already work with someone
// knowing their name is not the exposure this toggle governs.**
//
// 🚨 WHY THIS TEST EXISTS. A future lane will read "opted out" on a profile payload
// and reasonably conclude the name should be suppressed there too. That change would
// look like a privacy fix and would break every legitimate manager-lookup: a report
// could no longer see who they report to, a workflow approver could not see whose
// request they are approving, and the surfaces would start disagreeing about who
// somebody is. If this test fails, the fix is a RULING, not a patch — take it back to
// the register rather than making the profile a seal.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8");

const personalTab = read("features/hr/people/profile/tabs/PersonalTab.tsx");

const profile = read("features/hr/people/profile/EmployeeProfile.tsx");
const profileHeader = read("features/hr/people/profile/ProfileHeader.tsx");
const useProfile = read("features/hr/people/profile/useHrProfile.ts");

/**
 * Source with comments removed.
 *
 * The interesting question is what the CODE does with the flag; the comments around
 * it necessarily name it, and counting those would make this test break every time
 * somebody explains the rule better.
 */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("directory_opt_out — a browsing control, not a seal (§4.2, ruled 2026-08-27)", () => {
  it("the profile never suppresses identity on the opt-out", () => {
    // The flag may be READ on the profile — that is how the toggle renders its own
    // state — but nothing may branch the display of who somebody is on it.
    for (const [name, source] of [
      ["EmployeeProfile", profile],
      ["ProfileHeader", profileHeader],
      ["useHrProfile", useProfile],
    ] as const) {
      expect({ name, mentions: /directory_opt_out/.test(source) }).toEqual({
        name,
        mentions: false,
      });
    }
  });

  it("PersonalTab reads the flag only to drive the toggle, never to hide a name", () => {
    // Two uses in CODE and no more: the switch's field name, and its value.
    const uses = codeOnly(personalTab).match(/directory_opt_out/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(personalTab).toContain('field="directory_opt_out"');
    expect(personalTab).toContain("value={personal.directory_opt_out === true}");
    // Nothing renders conditionally on it — that is the seal this forbids.
    expect(codeOnly(personalTab)).not.toMatch(
      /directory_opt_out\s*(===\s*true\s*)?\?/,
    );
  });

  it("the toggle's copy states the limit, so the promise matches the ruling", () => {
    // Not-findable by browsing…
    expect(personalTab).toContain("You won't turn up in the staff directory");
    expect(personalTab).toContain("your name is hidden on the org chart");
    // …and explicitly NOT a seal. This sentence is the honest half; if somebody
    // widens the promise, this is what should stop them.
    expect(personalTab).toContain("it is not a disguise");
    expect(personalTab).toContain("can still open your profile and see your name");
  });
});
