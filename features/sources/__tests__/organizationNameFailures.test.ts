import { mergeOrganizationNameFailures } from "@/features/sources/hooks/useSources";

describe("paged Source organization-name reads", () => {
  it("keeps a first-page failure when a later page succeeds for another organization", () => {
    const afterFirstPage = mergeOrganizationNameFailures(new Set(), ["org-missing"], false);
    const afterSecondPage = mergeOrganizationNameFailures(afterFirstPage, ["org-loaded"], true);

    expect(afterSecondPage).toEqual(new Set(["org-missing"]));
    expect(afterSecondPage.has("org-loaded")).toBe(false);
  });
});
