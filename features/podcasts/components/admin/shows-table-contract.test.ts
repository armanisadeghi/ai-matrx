import { podcastShowSearchText } from "./shows-table-contract";

describe("podcast shows table search contract", () => {
  it("keeps an ID-only query in the shared table search projection", () => {
    expect(podcastShowSearchText({ id: "show-uuid-only", title: "A title", slug: "a-title", author: null } as never)).toContain("show-uuid-only");
  });
});
