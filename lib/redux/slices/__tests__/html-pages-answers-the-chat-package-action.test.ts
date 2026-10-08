/**
 * The chat package dispatches the publish feature's "active page" by action
 * TYPE (it never imports this host slice, P22). If this slice is renamed or
 * its reducer stops answering, the package's dispatch would land nowhere and
 * say nothing — this test is what says so.
 */
import reducer, {
  setActivePageId as hostSetActivePageId,
} from "@/lib/redux/slices/htmlPagesSlice";
import { setActivePageId } from "@ai-matrx/chat/ui/html-preview/html-pages-actions";

describe("htmlPages answers the chat package's active-page action", () => {
  it("has the same type as the slice's own action creator", () => {
    expect(setActivePageId.type).toBe(hostSetActivePageId.type);
  });

  it("sets and clears the active page through the host reducer", () => {
    const initial = reducer(undefined, { type: "@@init" });
    const set = reducer(initial, setActivePageId("page-42"));
    expect(set.activePageId).toBe("page-42");
    expect(reducer(set, setActivePageId(null)).activePageId).toBeNull();
  });
});
