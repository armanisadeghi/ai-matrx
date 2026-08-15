import { cmsDocumentTitle } from "../cmsDocumentMetadata";

const site = { id: "site-uuid", name: "PBW Law Website" };
const pages = [
  { id: "page-uuid", title: "Subrogation & Third-Party Recovery" },
];

describe("cmsDocumentTitle", () => {
  it("uses the website name on the site workspace instead of its UUID", () => {
    expect(cmsDocumentTitle(site, pages, "/cms/site-uuid")).toBe(
      "PBW Law Website — AI Matrx",
    );
  });

  it("combines the page and website names in the page editor", () => {
    expect(
      cmsDocumentTitle(site, pages, "/cms/site-uuid/pages/page-uuid"),
    ).toBe("Subrogation & Third-Party Recovery | PBW Law Website — AI Matrx");
  });

  it("names non-page CMS sections", () => {
    expect(cmsDocumentTitle(site, pages, "/cms/site-uuid/collections")).toBe(
      "Collections | PBW Law Website — AI Matrx",
    );
  });
});
