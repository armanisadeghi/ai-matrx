import { studioSearchFor, syncStudioSourceUrl } from "./studio-url";

describe("studio URL names the record on screen (RC-B1 D2)", () => {
  beforeEach(() => {
    window.history.replaceState(
      null,
      "",
      "/markdown-studio?source=agent-prompt&id=aaaaaaaa-0000-0000-0000-000000000001",
    );
  });

  it("a pick after a deep link moves the URL to the picked record", () => {
    syncStudioSourceUrl({ kind: "flashcard-front", id: "bbbbbbbb-0000-0000-0000-000000000002" });
    expect(window.location.search).toBe(
      "?source=flashcard-front&id=bbbbbbbb-0000-0000-0000-000000000002",
    );
    // A second pick from a closure that still "remembers" the first URL.
    syncStudioSourceUrl({ kind: "note", id: "cccccccc-0000-0000-0000-000000000003" });
    expect(window.location.search).toBe(
      "?source=note&id=cccccccc-0000-0000-0000-000000000003",
    );
  });

  it("re-picking the deep-linked record after another pick restores it", () => {
    syncStudioSourceUrl({ kind: "note", id: "cccccccc-0000-0000-0000-000000000003" });
    syncStudioSourceUrl({ kind: "agent-prompt", id: "aaaaaaaa-0000-0000-0000-000000000001" });
    expect(window.location.search).toBe(
      "?source=agent-prompt&id=aaaaaaaa-0000-0000-0000-000000000001",
    );
  });

  it("a template, library sample or clear drops the source so reload never reopens a stale record", () => {
    syncStudioSourceUrl(null);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/markdown-studio");
  });

  it("keeps unrelated params", () => {
    expect(studioSearchFor("?x=1&source=note&id=a", null)).toBe("?x=1");
  });
});
