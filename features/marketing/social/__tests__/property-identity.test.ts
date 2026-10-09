import { propertyIdentity } from "../link";

describe("propertyIdentity", () => {
  it("collapses every URL variant of one YouTube handle to one identity", () => {
    const variants: Array<[string | null, string | null]> = [
      ["ArmanSadeghi", "http://www.youtube.com/@ArmanSadeghi"],
      ["armansadeghi", "https://www.youtube.com/c/armansadeghi"],
      [null, "https://youtube.com/@ArmanSadeghi/videos?x=1"],
      ["@ArmanSadeghi", null],
    ];
    const ids = new Set(variants.map(([h, u]) => propertyIdentity("youtube", h, u)));
    expect([...ids]).toEqual(["armansadeghi"]);
  });
  it("derives from the address when no handle is stored, and ignores case/trailing slash", () => {
    expect(propertyIdentity("x", null, "https://twitter.com/TitaniumSuccess/")).toBe("titaniumsuccess");
    expect(propertyIdentity("linkedin", null, "https://www.linkedin.com/in/arman-sadeghi-8b176627/")).toBe("arman-sadeghi-8b176627");
    expect(propertyIdentity("youtube", null, "https://www.youtube.com/channel/UCF4Ku_RBslqV3A36j6KddZQ?view_as=subscriber")).toBe("ucf4ku_rbslqv3a36j6kddzq");
  });
  it("has no identity for websites, listings and video links", () => {
    expect(propertyIdentity("website", null, "https://a.com/b")).toBeNull();
    expect(propertyIdentity("youtube", null, "https://www.youtube.com/watch?v=VdmZoNmRlm0")).toBeNull();
  });
  it("keeps different accounts and platforms distinct", () => {
    expect(propertyIdentity("instagram", "iopbmedicine", null)).not.toBe(propertyIdentity("instagram", "iopb_medicine", null));
  });
});
