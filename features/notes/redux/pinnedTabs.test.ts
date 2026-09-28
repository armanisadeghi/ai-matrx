/**
 * PINNED TABS LEAD, AND MOVING A TAB NEVER CROSSES THE PIN LINE
 * (page-pass /notes, 2026-09-28 — Arman's ruling: the tab "…" holds Pin and Move).
 *
 * Breaks each test names:
 * - activating an unpinned tab jumps it in front of a pinned one → "lead" red.
 * - Close others / Close all / idle auto-move treat a pinned tab like any other → "survive" red.
 * - Move left/right swaps across the pinned block or off the edge → "move" red.
 */
import reducer, {
  registerInstance,
  addInstanceTab,
  setInstanceActiveTab,
  toggleInstanceTabPinned,
  moveInstanceTab,
  moveActiveTabToFront,
  removeInstanceTab,
  reorderInstanceTabs,
} from "./slice";

const I = "inst-1";
type S = ReturnType<typeof reducer>;
function open(...ids: string[]): S {
  let s = reducer(undefined, registerInstance(I));
  for (const id of ids) s = reducer(s, addInstanceTab({ instanceId: I, noteId: id }));
  return s;
}
const tabs = (s: S) => s.instances[I]!.openTabs;

describe("pinned tabs", () => {
  it("lead: pinning moves a tab into the pinned block; activating another never jumps it", () => {
    let s = open("a", "b", "c");
    s = reducer(s, toggleInstanceTabPinned({ instanceId: I, noteId: "c" }));
    expect(tabs(s)).toEqual(["c", "a", "b"]);
    s = reducer(s, setInstanceActiveTab({ instanceId: I, noteId: "b" }));
    expect(tabs(s)).toEqual(["c", "b", "a"]);
    s = reducer(s, setInstanceActiveTab({ instanceId: I, noteId: "c" }));
    expect(tabs(s)).toEqual(["c", "b", "a"]);
    s = reducer(s, moveActiveTabToFront({ instanceId: I }));
    expect(tabs(s)).toEqual(["c", "b", "a"]);
  });

  it("survive: a drag keeps pinned first; unpin lands first after the block; closing drops the pin", () => {
    let s = open("a", "b", "c");
    s = reducer(s, toggleInstanceTabPinned({ instanceId: I, noteId: "b" }));
    s = reducer(s, reorderInstanceTabs({ instanceId: I, tabs: ["a", "c", "b"] }));
    expect(tabs(s)).toEqual(["b", "a", "c"]);
    s = reducer(s, toggleInstanceTabPinned({ instanceId: I, noteId: "b" }));
    expect(s.instances[I]!.pinnedTabs).toEqual([]);
    expect(tabs(s)).toEqual(["b", "a", "c"]);
    s = reducer(s, toggleInstanceTabPinned({ instanceId: I, noteId: "c" }));
    s = reducer(s, removeInstanceTab({ instanceId: I, noteId: "c" }));
    expect(s.instances[I]!.pinnedTabs).toEqual([]);
  });

  it("move: one place within its block, never across the pin line or off the edge", () => {
    let s = open("a", "b", "c");
    s = reducer(s, toggleInstanceTabPinned({ instanceId: I, noteId: "a" }));
    s = reducer(s, moveInstanceTab({ instanceId: I, noteId: "b", direction: -1 }));
    expect(tabs(s)).toEqual(["a", "b", "c"]);
    s = reducer(s, moveInstanceTab({ instanceId: I, noteId: "b", direction: 1 }));
    expect(tabs(s)).toEqual(["a", "c", "b"]);
    s = reducer(s, moveInstanceTab({ instanceId: I, noteId: "b", direction: 1 }));
    expect(tabs(s)).toEqual(["a", "c", "b"]);
  });
});
