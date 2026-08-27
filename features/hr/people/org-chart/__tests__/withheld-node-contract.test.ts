// features/hr/people/org-chart/__tests__/withheld-node-contract.test.ts
//
// §4.2's chart exception, locked as a contract: NAME WITHHELD, STRUCTURE INTACT.
//
// A source-contract test in this directory's established idiom (see
// `responsive-contract.test.ts`), and for the reason `layout.test.ts` gives for its
// own existence: the interesting input is invisible to a test account. A withheld
// node is produced by `hr_org_chart` projecting `name_withheld` for somebody who has
// opted out, and until that door half ships there is no way to render one live — and
// once it ships, the properties below are the ones a refactor would quietly drop.
//
// 🚨 THE BRANCH THESE TESTS GUARD IS THE SECURITY-RELEVANT ONE. A withheld node with
// a profile link is a door the viewer cannot open, on a person who asked not to be
// found; a withheld node whose aria-label interpolates the name hands the name to a
// screen reader after the server went to the trouble of withholding it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const chart = readFileSync(
  join(process.cwd(), "features/hr/people/org-chart/HrOrgChart.tsx"),
  "utf8",
);

const types = readFileSync(
  join(process.cwd(), "features/hr/types.ts"),
  "utf8",
);

const exporter = readFileSync(
  join(process.cwd(), "features/hr/people/org-chart/orgChartExport.ts"),
  "utf8",
);

describe("org chart — the withheld node (§4.2)", () => {
  it("gives a withheld node NO profile door", () => {
    // The call site chooses null rather than an href it knows will refuse.
    expect(chart).toContain("node.name_withheld === true\n                          ? null");
    // And the card renders a non-link branch rather than a disabled link.
    expect(chart).toContain("{props.href ? (");
  });

  it("never interpolates a withheld name into the team-toggle label", () => {
    // `teamLabel` is the indirection that makes this true; the raw
    // `${props.name}'s team` form must not come back.
    expect(chart).toContain('const teamLabel = props.nameWithheld');
    expect(chart).not.toContain("`Expand ${props.name}'s team`");
    expect(chart).not.toContain("`Collapse ${props.name}'s team`");
  });

  it("keeps the node in the tree rather than dropping it", () => {
    // 🚨 The node is laid out from `nodes` with no withheld filter anywhere: a gap
    // where a node should be is itself a disclosure, because everyone can see
    // exactly who is missing and where. If a `filter` on name_withheld ever
    // appears, this is the test that should fail.
    expect(chart).not.toMatch(/\.filter\([^)]*name_withheld/);
  });

  it("declares the projection as optional, so a door that omits it means 'not withheld'", () => {
    expect(types).toContain("name_withheld?: boolean;");
  });

  it("exports the withheld statement rather than a name it does not have", () => {
    // The CSV reads `display_name`, which for a withheld node IS the statement —
    // so the export inherits the protection from the wire instead of re-deriving
    // it. This asserts it still reads that field and not some other name source.
    expect(exporter).toContain("node.display_name");
  });
});
