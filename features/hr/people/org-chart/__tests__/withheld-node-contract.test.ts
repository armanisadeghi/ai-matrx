// features/hr/people/org-chart/__tests__/withheld-node-contract.test.ts
//
// §4.2's chart exception, locked as a contract: NAME WITHHELD, STRUCTURE INTACT.
//
// A source-contract test in this directory's established idiom (see
// `responsive-contract.test.ts`). The door is live now, and these lock the
// properties a refactor would quietly drop.
//
// 🚨 THE FIRST TEST IS THE ONE THAT MATTERS MOST. `hr_org_chart` sends `opted_out`
// as the PERSON'S PREFERENCE — true for HR as well — and `display_name` as null only
// for a viewer who may not have the name. Keying suppression on `opted_out` would
// blank the name for the very people entitled to see it, which is a bug that looks
// like a privacy feature. Verified live before this was written.
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

const directory = readFileSync(
  join(process.cwd(), "features/hr/people/directory/HrDirectory.tsx"),
  "utf8",
);

const exporter = readFileSync(
  join(process.cwd(), "features/hr/people/org-chart/orgChartExport.ts"),
  "utf8",
);

describe("org chart — the withheld node (§4.2)", () => {
  it("keys suppression on the NAME, never on the person's preference", () => {
    // `isWithheld` reads display_name only.
    expect(chart).toContain('return node.display_name === null || node.display_name === "";');
    // Nothing may branch rendering on `opted_out` — see the header.
    expect(chart).not.toMatch(/node\.opted_out\s*===\s*true/);
    expect(chart).not.toMatch(/opted_out\s*\?/);
  });

  it("gives a withheld node NO PHOTO — a face identifies more than a name", () => {
    /*
      §5.2 gained the chart photo on 2026-08-28. The withheld node is the one
      place that addition could undo the suppression it sits next to: the door
      withholds somebody's NAME and a photo would hand back the identity anyway,
      more completely than the name did.

      Two locks, because one of them is somebody else's file. The door already
      ties the photo to the name — `case when sup.nm is not null then
      e.photo_file_id end` — and this component passes null again at the call
      site, so a regression in either place still renders initials.
    */
    expect(chart).toContain(
      "photoFileId={isWithheld(node) ? null : node.photo_file_id}",
    );
    // ...and the node itself refuses to render one for a withheld person.
    expect(chart).toMatch(/props\.nameWithheld \? null : \(\s*<HrEmployeePhoto/);
  });

  it("gives a withheld node NO profile door, in the canvas and the tray", () => {
    expect(chart).toContain("isWithheld(node)\n                          ? null");
    expect(chart).toContain("{props.href ? (");
    // The tray renders a <span> for a withheld person rather than a Link.
    expect(chart).toContain("const withheld = isWithheld(person);");
  });

  it("lets the org's own sentence win, and marks our fallback as not theirs", () => {
    // The knob's statement, when present, is what renders.
    expect(chart).toContain("if (statement) return { text: statement, authored: true };");
    // Ours is flagged so the card can style it as system chrome, not prose.
    expect(chart).toContain('return { text: "Name withheld", authored: false };');
    expect(chart).toContain("props.statementAuthored ? (");
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

  it("types the door's real projection — nullable name, optional preference", () => {
    // `display_name` must be nullable or every call site silently assumes a name.
    expect(types).toContain("display_name: string | null;");
    // The preference and the org's sentence both arrive, both optional.
    expect(types).toContain("opted_out?: boolean;");
    expect(types).toContain("disclosure_statement?: string | null;");
  });

  it("keeps a withheld manager out of the directory's manager filter", () => {
    // Offering the withheld treatment as a pickable option would turn "who is the
    // hidden manager of these two people" into one click.
    expect(directory).toContain(
      'typeof node.display_name === "string" && node.display_name.length > 0,',
    );
  });

  it("exports the withheld statement rather than a name it does not have", () => {
    // The CSV reads `display_name`, which for a withheld node IS the statement —
    // so the export inherits the protection from the wire instead of re-deriving
    // it. This asserts it still reads that field and not some other name source.
    expect(exporter).toContain("node.display_name");
  });
});
