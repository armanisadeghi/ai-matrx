import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "PartyIdentityCard.tsx"), "utf8");

describe("CRM category creation organization contract", () => {
  it("binds every single-category creator to the record organization", () => {
    const pickers = source.match(/<CategorySelect[\s\S]*?\/>/g) ?? [];

    expect(pickers).toHaveLength(2);
    for (const picker of pickers) {
      expect(picker).toContain("orgId={party.organization_id}");
    }
  });

  it("names the two category vocabularies honestly", () => {
    expect(source).toMatch(
      /dimension=\{CATEGORY_DIMENSIONS\.crmLifecycleStage\}[\s\S]*?noun="stage"/,
    );
    expect(source).toMatch(
      /dimension=\{CATEGORY_DIMENSIONS\.crmRating\}[\s\S]*?noun="rating"/,
    );
  });
});
