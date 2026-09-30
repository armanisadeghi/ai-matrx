/**
 * AO-162 / AO-163 (active-org-is-never-a-list-filter): the data home labels a row by its OWN
 * organization (or none) and resolves its list-default knobs in the organization the FILTER names,
 * else at the person / platform tier — never the ACTIVE organization. Forcing input: the hub
 * source; either regression (the active org's name as a fallback label, or the active org as the
 * knob rung) puts the forbidden token back in it.
 */
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "OrganizationHub.tsx"), "utf8");

describe("OrganizationHub and the active organization", () => {
  it("never labels a row with the active organization's name", () => {
    expect(source).not.toMatch(/selectOrganizationName/);
  });

  it("never resolves a list-default knob in the active organization", () => {
    expect(source).not.toMatch(/organizationId \?\? knobOrganizationId/);
  });
});
