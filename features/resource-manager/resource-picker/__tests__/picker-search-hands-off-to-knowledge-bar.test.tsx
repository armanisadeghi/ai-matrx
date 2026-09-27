/** @jest-environment jsdom */
//
// The chat "+" picker's SEARCH step hands off to ⌘K (KNOWLEDGE-HUB.md §5.1):
// one search over everything, with attaching to THIS composer as the primary
// action, and the picker's non-search views (Upload, URL entry, Voice,
// Tools…) carried into the bar as commands that re-open the picker there.
//
// The real ResourcePickerMenu and the real attach adapter run; only the
// overlay opener (what would render the bar) and the note read are doubled.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: <T,>(selector: (state: object) => T) => selector({}),
}));
jest.mock("@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas", () => ({
  useOpenCloudBrowserCanvas: () => jest.fn(),
}));
jest.mock("../useRunControlCounts", () => ({ useRunControlCounts: () => ({}) }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const openBar = jest.fn();
jest.mock("@/features/overlays/openers/knowledgeCommandBar", () => ({
  useOpenKnowledgeCommandBar: () => openBar,
}));

const openPickerWindow = jest.fn();
jest.mock("@/features/overlays/openers/resourcePickerWindow", () => ({
  useOpenResourcePickerWindow: () => openPickerWindow,
}));

const note = { id: "note-1", label: "Grant budget assumptions", content: "…" };
jest.mock("@/features/notes/service/notesService", () => ({
  fetchNoteById: jest.fn(async () => note),
}));

import { ResourcePickerMenu } from "../ResourcePickerMenu";
import type { OpenKnowledgeCommandBarOptions } from "@/features/overlays/openers/knowledgeCommandBar";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  openBar.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function clickSearchRow() {
  const row = container.querySelector<HTMLButtonElement>(
    '[data-testid="picker-knowledge-search"]',
  );
  expect(row).not.toBeNull();
  act(() => row!.click());
}

it("opens the ⌘K bar with attach-here as the primary action and the picker's own commands", async () => {
  const onResourceSelected = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();
  const onReopenAt = jest.fn();
  act(() => {
    root.render(
      <ResourcePickerMenu
        onResourceSelected={onResourceSelected}
        onClose={onClose}
        onReopenAt={onReopenAt}
      />,
    );
  });

  clickSearchRow();

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(openBar).toHaveBeenCalledTimes(1);
  const opts = openBar.mock.calls[0][0] as OpenKnowledgeCommandBarOptions;
  expect(opts.primaryAction).toBe("attach");

  // Upload and URL entry stay their own commands and re-open the picker there.
  const labels = (opts.commands ?? []).map((c) => c.label);
  expect(labels).toContain("Upload or browse files");
  expect(labels).toContain("Webpage");
  expect(labels).not.toContain("Notes"); // a search step — the bar replaces it
  opts.commands!.find((c) => c.label === "Upload or browse files")!.run();
  expect(onReopenAt).toHaveBeenCalledWith("files");

  // Attaching a found note goes through this composer's own pick handler,
  // carrying the full note payload — never a bare id.
  const attach = opts.attach!;
  const hit = { entity: "note", id: "note-1", title: "Grant budget assumptions" };
  expect(attach.accepts(hit)).toBe(true);
  expect(attach.accepts({ entity: "agent", id: "a-1", title: "Grant reviewer" })).toBe(false);
  await act(async () => {
    await attach.attach(hit);
  });
  expect(onResourceSelected).toHaveBeenCalledWith({ type: "note", data: note });
});

it("every host keeps Upload / URL / Voice / Tools as commands wired to ITS OWN handlers", () => {
  const onResourceSelected = jest.fn();
  const onResourceDeselected = jest.fn();
  act(() => {
    root.render(
      <ResourcePickerMenu
        onResourceSelected={onResourceSelected}
        onResourceDeselected={onResourceDeselected}
        onClose={jest.fn()}
        conversationId="conv-1"
        attachmentCapabilities={{ supportsAudio: true, supportsYoutubeVideos: true }}
      />,
    );
  });
  clickSearchRow();
  const opts = openBar.mock.calls[0][0] as OpenKnowledgeCommandBarOptions;
  const labels = (opts.commands ?? []).map((c) => c.label);
  for (const label of ["Upload or browse files", "Webpage", "YouTube", "Voice Pad", "Tools"]) {
    expect(labels).toContain(label);
  }
  opts.commands!.find((c) => c.label === "Voice Pad")!.run();
  expect(openPickerWindow).toHaveBeenCalledWith(
    expect.objectContaining({
      initialView: "audio",
      onResourceSelected,
      onResourceDeselected,
      conversationId: "conv-1",
    }),
  );
});

it("does not offer kinds the host cannot take", () => {
  act(() => {
    root.render(
      <ResourcePickerMenu
        onResourceSelected={jest.fn()}
        onClose={jest.fn()}
        allowedViewIds={["files"]}
      />,
    );
  });
  clickSearchRow();
  const opts = openBar.mock.calls[0][0] as OpenKnowledgeCommandBarOptions;
  expect(opts.attach!.accepts({ entity: "note", id: "n", title: "x" })).toBe(false);
  expect(opts.attach!.accepts({ entity: "file", id: "f", title: "x.pdf" })).toBe(true);
  // Only the kinds this host takes become commands.
  expect((opts.commands ?? []).map((c) => c.label)).toEqual(["Upload or browse files"]);
});
