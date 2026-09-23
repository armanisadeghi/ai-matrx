import {
  htmlPagesListStateToSearchParams,
  parseHtmlPagesListState,
} from "../list-url-state";

describe("HTML pages list view state", () => {
  it("defaults to grid and leaves the default view out of the URL", () => {
    const state = parseHtmlPagesListState(new URLSearchParams());

    expect(state.view).toBe("grid");
    expect(htmlPagesListStateToSearchParams(state).has("view")).toBe(false);
  });

  it("preserves an explicit table view", () => {
    const state = parseHtmlPagesListState(new URLSearchParams("view=table"));

    expect(state.view).toBe("table");
    expect(htmlPagesListStateToSearchParams(state).get("view")).toBe("table");
  });
});
