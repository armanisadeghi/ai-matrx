import { readFileSync } from "fs";
import { join } from "path";
import {
  onlyOpenOrganizations,
  organizationDisambiguators,
} from "../organizationsToCreateIn";

const harborLive = { id: "11f4e747", name: "Harbor Dental Group", slug: "harbor-dental-group" };
const harborArchived = { id: "2237fcf3", name: "Harbor Dental Group", slug: "zzz-real-data-test-throwaway" };

describe("create pickers never offer an archived organization", () => {
  it("drops the archived one, keeps the open one", () => {
    const out = onlyOpenOrganizations([harborArchived, harborLive], new Set([harborLive.id]));
    expect(out.map((o) => o.id)).toEqual([harborLive.id]);
  });

  it("tells two live organizations with one name apart by address", () => {
    const d = organizationDisambiguators([harborLive, harborArchived]);
    expect(d.get(harborLive.id)).toBe("harbor-dental-group");
    expect(organizationDisambiguators([harborLive]).get(harborLive.id)).toBeNull();
  });

  it("every nav-tree organization picker goes through the open-organizations hook", () => {
    const root = join(__dirname, "../../..");
    for (const f of [
      "features/projects/components/ProjectFormCore.tsx",
      "features/projects/components/ProjectImportJsonPanel.tsx",
      "features/sharing/components/AddEveryoneInOrg.tsx",
    ]) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src).toContain("useOrganizationsToCreateIn()");
      expect(src).not.toMatch(/=\s*useNavTree\(\)/);
    }
  });
});
