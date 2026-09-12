import {
  filterDisabledTabs,
  selectEditorContextEntries,
} from "./editorContextEntries";
import type { CodeTabsState } from "../redux/tabsSlice";

describe("editor context boundaries", () => {
  it("recovers only actual paths for closed recent files", () => {
    const entries = selectEditorContextEntries.resultFunc(
      { byId: {}, order: [], activeId: null, recentTabIds: [] },
      ["sandbox:sandbox-id:/home/agent/a.ts", "library:record-id"],
      {},
    );
    expect(
      entries.find((entry) => entry.key === "editor.recentFiles")?.value,
    ).toEqual([
      expect.objectContaining({ path: "/home/agent/a.ts", open: false }),
    ]);
  });
  const tab = {
    id: "library:document-id",
    path: "library:/index.ts",
    name: "index.ts",
    language: "typescript",
    content: "unsaved buffer",
    pristineContent: "saved buffer",
    dirty: true,
  };
  const tabs: CodeTabsState = {
    byId: { [tab.id]: tab },
    order: [tab.id],
    activeId: tab.id,
    recentTabIds: [tab.id],
  };

  it("identifies Library records separately from filesystem paths and supplies unsaved contents", () => {
    const entries = selectEditorContextEntries.resultFunc(
      tabs,
      tabs.recentTabIds,
      {},
    );
    expect(
      entries.find((entry) => entry.key === `editor.tab.${tab.id}`)?.value,
    ).toMatchObject({
      content: "unsaved buffer",
      pristineContent: "saved buffer",
      dirty: true,
      identity: {
        adapter: "library",
        libraryFileId: "document-id",
        path: "library:/index.ts",
      },
    });
  });

  it("excludes a file from summaries, active identity, recent files, buffer and explicit selections", () => {
    const entries = selectEditorContextEntries.resultFunc(
      tabs,
      tabs.recentTabIds,
      {},
    );
    entries.push({
      key: `editor.selection.${tab.id}`,
      type: "json",
      label: "Selection",
      value: { text: "unsaved buffer" },
    });
    const filtered = filterDisabledTabs(entries, [tab.id]);
    expect(
      filtered.find((entry) => entry.key === "editor.tabs")?.value,
    ).toMatchObject({ tabs: [], activeId: null });
    expect(
      filtered.find((entry) => entry.key === "editor.activeFile")?.value,
    ).toBeNull();
    expect(
      filtered.find((entry) => entry.key === "editor.recentFiles")?.value,
    ).toEqual([]);
    expect(
      filtered.some(
        (entry) =>
          entry.key.startsWith("editor.tab.") ||
          entry.key.startsWith("editor.selection."),
      ),
    ).toBe(false);
  });
});
