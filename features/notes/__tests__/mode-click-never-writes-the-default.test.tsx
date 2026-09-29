/**
 * A MODE CLICK NEVER WRITES THE PERSON'S DEFAULT (Arman, 2026-09-27).
 *
 * The break this guards: every click on a note's mode used to save that mode as
 * `userPreferences.notes.defaultEditorMode` (and the phone's toggle as
 * `defaultPhoneEditorMode`) — one click on one note silently became the mode of
 * every note, which is exactly how Toast UI "became the default". A click
 * changes only THAT note: its mode now and the mode it reopens in
 * (`notes.noteModes`). The defaults change only on the Notes settings page.
 *
 * Two halves, each able to go red on its own:
 *   1. Behaviour — `useSelectNoteMode` (the ONE click handler every notes mode
 *      control uses) on a real notes + preferences store: the note's mode and
 *      its remembered mode move; both defaults do not.
 *   2. Census — no notes source file other than the reader
 *      (usePreferredDefaultEditorMode.ts) names a default-mode setting, and the
 *      reader only ever destructures the VALUE, never the setter.
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import notesReducer, { upsertNoteFromServer } from "../redux/slice";
import userPreferencesReducer from "@/lib/redux/preferences/userPreferencesSlice";
import { useSelectNoteMode } from "../hooks/usePreferredDefaultEditorMode";
import type { Note } from "../types";

const ID = "44444444-4444-4444-8444-444444444444";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (): Note => ({
  id: ID, organization_id: ORG, version: 1, content: "Dock 3: Ridgeline", label: "Dock schedule",
  folder_name: null, folder_id: null, tags: [], metadata: {}, published_to_web: false, position: 0,
  project_id: null, task_id: null, created_at: "2026-09-27T00:00:00.000Z", created_by: ACTOR,
  updated_at: "2026-09-27T00:00:00.000Z", updated_by: ACTOR, deleted_at: null, content_hash: null,
  file_path: null, last_device_id: null, custom_fields: {}, sync_version: 0,
  search_engine_indexed: null, shown_to: null,
});

beforeAll(() => {
  enableMapSet();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("a mode click changes only that note", () => {
  it.each([
    ["write", "write"],
    ["plain", "plain"],
    ["split", "plain"],
  ] as const)("clicking %s moves the note (remembered as %s) and never the defaults", async (mode, remembered) => {
    const store = configureStore({
      reducer: { notes: notesReducer, userPreferences: userPreferencesReducer },
      middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(upsertNoteFromServer({ note: row(), fetchStatus: "full" }));
    const before = store.getState().userPreferences.notes;

    let click: ((noteId: string, next: typeof mode) => void) | null = null;
    function Probe() {
      click = useSelectNoteMode();
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<Provider store={store}><Probe /></Provider>);
    });
    await act(async () => {
      click?.(ID, mode);
    });

    const after = store.getState();
    expect(after.notes.notes[ID]._editorMode).toBe(mode);
    expect(after.userPreferences.notes.noteModes?.[ID]).toBe(remembered);
    expect(after.userPreferences.notes.defaultEditorMode).toBe(before.defaultEditorMode);
    expect(after.userPreferences.notes.defaultPhoneEditorMode).toBe(before.defaultPhoneEditorMode);
    await act(async () => root.unmount());
  });
});

describe("no notes code writes a default mode", () => {
  const ROOT = process.env.NOTES_MODE_GUARD_ROOT ?? join(__dirname, "..", "..", "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : files(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  const DEFAULT_SETTING = /DEFAULT_(PHONE_)?EDITOR_MODE_SETTING|notes\.default(Phone)?EditorMode/;

  it("only the reader names a default-mode setting, and it never takes the setter", () => {
    const notesFiles = files(join(ROOT, "features/notes"));
    expect(notesFiles.length).toBeGreaterThan(10);
    const naming = notesFiles
      .filter((file) => DEFAULT_SETTING.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    expect(naming).toEqual(["features/notes/hooks/usePreferredDefaultEditorMode.ts"]);
    const reader = readFileSync(join(ROOT, "features/notes/hooks/usePreferredDefaultEditorMode.ts"), "utf8");
    // `const [value, setValue] = useSetting<…>(DEFAULT_…)` would be a writer.
    expect(reader).not.toMatch(/\[\s*\w*\s*,\s*\w+\s*\]\s*=\s*useSetting<[^>]*>\(\s*DEFAULT_/);
  });
});
