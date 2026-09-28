import { educationCreatorManifest } from "./education-creator.manifest";

describe("Creator profile surface", () => {
  it("limits agent writes to creator identity and visibility", () => {
    expect(educationCreatorManifest.writeTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "claim_creator_profile", applyPolicy: "ask" }),
        expect.objectContaining({ name: "update_creator_profile", applyPolicy: "ask" }),
        expect.objectContaining({ name: "set_creator_page_visibility", applyPolicy: "ask" }),
      ]),
    );
    expect(educationCreatorManifest.writeTargets?.map((target) => target.name)).not.toEqual(
      expect.arrayContaining(["delete_creator_profile", "update_creator_payouts"]),
    );
  });
});
