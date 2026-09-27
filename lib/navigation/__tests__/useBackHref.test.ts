import { previousPageUrl } from "../useBackHref";

const O = "https://aimatrx.com";
const e = (path: string) => ({ url: `${O}${path}` });

describe("previousPageUrl — Back returns where this tab came from", () => {
  it("returns the previous page with its filters", () => {
    expect(previousPageUrl([e("/notes?sort=name"), e("/notes/1")], 1, "/notes/1", O)).toBe("/notes?sort=name");
  });

  it("skips this page's own tab/mode switches", () => {
    expect(
      previousPageUrl([e("/crm?stage=lead"), e("/crm/9"), e("/crm/9?tab=notes")], 2, "/crm/9", O),
    ).toBe("/crm?stage=lead");
  });

  it("has nothing behind a page opened straight from a link", () => {
    expect(previousPageUrl([e("/crm/9")], 0, "/crm/9", O)).toBeNull();
  });

  it("never leaves the origin", () => {
    expect(previousPageUrl([{ url: "https://google.com/search" }, e("/crm/9")], 1, "/crm/9", O)).toBeNull();
  });
});
