import {
  __resetConversationViewStateForTests,
  getConversationViewState,
  setConversationFindOpen,
  setConversationPinnedOnly,
} from "../conversation-view-state";

// The header menu and the transcript never share a React parent; this store is
// the only thing that carries "find is open" / "pinned only" between them.
describe("conversation view state", () => {
  beforeEach(() => __resetConversationViewStateForTests());

  it("starts closed and unfiltered for any conversation", () => {
    expect(getConversationViewState("a")).toEqual({ findOpen: false, pinnedOnly: false });
  });

  it("keeps each conversation's view separate", () => {
    setConversationFindOpen("a", true);
    setConversationPinnedOnly("b", true);
    expect(getConversationViewState("a")).toEqual({ findOpen: true, pinnedOnly: false });
    expect(getConversationViewState("b")).toEqual({ findOpen: false, pinnedOnly: true });
  });

  it("returns the same snapshot when nothing changed (no render loop)", () => {
    setConversationFindOpen("a", true);
    const first = getConversationViewState("a");
    setConversationFindOpen("a", true);
    expect(getConversationViewState("a")).toBe(first);
    setConversationFindOpen("a", false);
    expect(getConversationViewState("a")).not.toBe(first);
  });
});
