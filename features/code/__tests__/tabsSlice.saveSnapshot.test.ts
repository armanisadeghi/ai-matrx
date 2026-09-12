import reducer, {
  markTabSaved,
  openTab,
  updateTabContent,
} from "../redux/tabsSlice";

const file = {
  id: "sandbox:old:/workspace/app.ts",
  path: "/workspace/app.ts",
  name: "app.ts",
  language: "typescript",
  content: "one",
  pristineContent: "one",
} as const;

describe("tab save snapshots", () => {
  it("keeps an edit made while a save is in flight dirty", () => {
    let state = reducer(undefined, openTab(file));
    state = reducer(state, updateTabContent({ id: file.id, content: "two" }));
    // The async writer persisted `two`, then the user typed `three` before
    // its completion callback arrived.
    state = reducer(state, updateTabContent({ id: file.id, content: "three" }));
    state = reducer(state, markTabSaved({ id: file.id, savedContent: "two" }));

    expect(state.byId[file.id]).toMatchObject({
      content: "three",
      pristineContent: "two",
      dirty: true,
    });
  });

  it("marks the exact saved snapshot clean", () => {
    let state = reducer(undefined, openTab(file));
    state = reducer(state, updateTabContent({ id: file.id, content: "two" }));
    state = reducer(state, markTabSaved({ id: file.id, savedContent: "two" }));
    expect(state.byId[file.id]).toMatchObject({
      pristineContent: "two",
      dirty: false,
    });
  });

  it("refuses edits to explicit and historical Git comparison tabs", () => {
    const diff = {
      ...file,
      id: "git-diff:sandbox:one:/workspace:working:app.ts",
      path: "git-diff:///workspace/app.ts",
      readOnly: true,
    };
    let state = reducer(undefined, openTab(diff));
    state = reducer(state, updateTabContent({ id: diff.id, content: "two" }));
    expect(state.byId[diff.id]).toMatchObject({
      content: "one",
      pristineContent: "one",
      dirty: false,
    });
  });

  it("refreshes an existing read-only Git comparison with the latest snapshot", () => {
    const diff = {
      ...file,
      id: "git-diff:sandbox:one:/workspace:working:app.ts",
      path: "git-diff:///workspace/app.ts",
      readOnly: true,
    };
    let state = reducer(undefined, openTab(diff));
    state = reducer(
      state,
      openTab({
        ...diff,
        content: "new comparison",
        pristineContent: "new comparison",
      }),
    );

    expect(state.order).toEqual([diff.id]);
    expect(state.byId[diff.id]).toMatchObject({
      content: "new comparison",
      pristineContent: "new comparison",
      dirty: false,
    });
  });

  it("does not replace an existing editable dirty buffer", () => {
    let state = reducer(undefined, openTab(file));
    state = reducer(state, updateTabContent({ id: file.id, content: "draft" }));
    state = reducer(
      state,
      openTab({
        ...file,
        content: "disk update",
        pristineContent: "disk update",
      }),
    );

    expect(state.byId[file.id]).toMatchObject({
      content: "draft",
      pristineContent: "one",
      dirty: true,
    });
  });
});
