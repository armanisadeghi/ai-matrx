/**
 * A note's version history opens IN THE CANVAS, beside the note — never a
 * docked side panel, a window secondary pane or a drawer of its own.
 *
 * Real pieces: the app's root reducer, its ONE canvas binding
 * (`CanvasHostProvider` + `<CanvasColumn>`), and the same `useNoteHistoryTab`
 * every Versions button uses. The hosts are page-sized, so their wiring is
 * read from source: a host that mounts its own history panel again goes RED.
 *
 * Proven failing before passing: against the pre-canvas hosts the source case
 * is RED; with the kind left out of FEATURE_CANVAS_KINDS the body case is RED.
 */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NOTE_HISTORY_KIND, useNoteHistoryTab } from "../canvas/noteHistoryKind";
import { upsertNoteFromServer } from "../redux/slice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/notes/n-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/notes/components/diff/NoteVersionHistoryPanel", () => ({
  NoteVersionHistoryPanel: ({ noteId }: { noteId: string }) => <p data-note-history="">{noteId}</p>,
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("Versions toggles one history tab per note, pressed while in front, showing the existing panel", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { tab: { isVisible: boolean; toggle: () => void } | null } = { tab: null };
  function Versions() {
    seen.tab = useNoteHistoryTab("n-1");
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <Versions />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const ids = () => Object.keys(store.getState().canvasHost.items);

  act(() => seen.tab?.toggle());
  await flush();
  expect(ids()).toEqual([`${NOTE_HISTORY_KIND}::n-1`]);
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector("[data-note-history]")?.textContent).toBe("n-1");

  act(() => seen.tab?.toggle());
  expect(ids()).toEqual([]);
  expect(seen.tab?.isVisible).toBe(false);
  act(() => root.unmount());
  container.remove();
});

it("every notes host opens the canvas tab — none mounts its own history panel", () => {
  const repo = join(__dirname, "..", "..", "..");
  const read = (file: string) => readFileSync(join(repo, file), "utf8");
  for (const file of [
    "features/notes/components/NotesView.tsx",
    "features/notes/components/NoteRecordTools.tsx",
  ]) {
    expect(read(file)).toContain("useNoteHistoryTab(");
  }
  // NoteViewControls is NoteModeSwitch + NoteRecordTools since 2026-10-09: its
  // Versions button is NoteRecordTools' (checked above).
  expect(read("features/notes/components/NoteViewControls.tsx")).toContain("<NoteRecordTools");
  expect(read("features/notes/components/NoteTabItem.tsx")).toMatch(/useToolOpener\(\(id: string\) => noteHistoryInput\(id, note\?\.label\)\)/);
  for (const file of [
    "features/notes/components/NotesView.tsx",
    "features/notes/components/NoteWorkspace.tsx",
    "features/notes/components/NotesWindowView.tsx",
    "features/window-panels/windows/notes/NotesWindow.tsx",
    "features/chat-context-bodies/NoteBody.tsx",
  ]) {
    const source = read(file);
    expect(source).not.toMatch(/NoteVersionHistory\b|NoteHistoryPane|InstanceHistoryOpen/);
  }
});

it("the history tab names its note — two history tabs never both read \"Version history\"", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    upsertNoteFromServer({
      note: { id: "n-1", label: "Q3 plan", organization_id: "org-1" },
      fetchStatus: "list",
    }),
  );
  const seen: { tab: { isVisible: boolean; toggle: () => void } | null } = { tab: null };
  function Versions() {
    seen.tab = useNoteHistoryTab("n-1");
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <Versions />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const id = `${NOTE_HISTORY_KIND}::n-1`;
  act(() => seen.tab?.toggle());
  await flush();
  expect(store.getState().canvasHost.items[id]?.title).toBe("Note history · Q3 plan");

  // A rename reaches the open tab.
  store.dispatch(
    upsertNoteFromServer({
      note: { id: "n-1", label: "Q4 plan", organization_id: "org-1" },
      fetchStatus: "list",
    }),
  );
  await flush();
  expect(store.getState().canvasHost.items[id]?.title).toBe("Note history · Q4 plan");
  act(() => root.unmount());
  container.remove();
});

it("every Versions and Outline tap button shows pressed through the system's pressed state", () => {
  const repo = join(__dirname, "..", "..", "..");
  for (const file of ["features/notes/components/NotesView.tsx", "features/notes/components/NoteRecordTools.tsx"]) {
    const source = readFileSync(join(repo, file), "utf8");
    // A className tint on a group tap button is not a pressed state (no
    // aria-pressed, overridden by the group's glyph colour) — RED before.
    expect(source).not.toContain('className={history.isVisible ? "text-primary" : undefined}');
    expect(source).not.toContain('className={outlineOpen ? "text-primary" : undefined}');
  }
  // The Versions TAP button lives in NoteRecordTools (the /notes header opens
  // history from its "…" menu, a menu item, not a tap button).
  expect(readFileSync(join(repo, "features/notes/components/NoteRecordTools.tsx"), "utf8")).toContain("pressed={history.isVisible}");
});
