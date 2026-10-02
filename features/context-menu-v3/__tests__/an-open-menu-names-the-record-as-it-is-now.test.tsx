/**
 * An open (or mounted) menu names the record as it is NOW.
 *
 * THE DEFECT (G6B review, 2026-10-02, reproduced on the nightly clone): type
 * into a new note, right-click its content — the header read "Note: New Note"
 * while the tab already read the note's new name. The record's heading was
 * copied into the menu's state at open, and the note auto-labels from its
 * first words 3 s after typing (or the person renames it), so the copy was
 * stale for as long as the menu stayed up.
 *
 * The fix this proves: the menu reads the record's heading from the registry
 * at render, and the record's owner says when its rows change
 * (`recordMenuChanged`).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "../NonEditableContextMenu";
import {
  RECORD_MENU_ATTR,
  recordMenuChanged,
  registerRecordMenu,
  type RecordMenuRows,
} from "../record-menu-registry";

const headings: Array<string | null> = [];
jest.mock("next/dynamic", () => () => (props: { heading?: { label: string; text: string } | null }) => {
  headings.push(props.heading ? `${props.heading.label}: ${props.heading.text}` : null);
  return null;
});
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "note-tab:inst-1:note-1";
let rows: RecordMenuRows = {
  entity: { type: "note", id: "note-1", title: "New Note", resourceType: "note" },
  extraSections: [],
  heading: { label: "Note", text: "New Note" },
};

let host: HTMLDivElement;
let root: Root;
let unregister: () => void = () => {};
beforeEach(() => {
  headings.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  unregister = registerRecordMenu(KEY, () => rows);
  act(() => {
    root.render(
      <div {...{ [RECORD_MENU_ATTR]: KEY }}>
        <NonEditableContextMenu sourceFeature="notes" contentSource={{ type: "note", id: "note-1" } as never}>
          <p data-testid="para">Supplier call follow-ups</p>
        </NonEditableContextMenu>
      </div>,
    );
  });
});
afterEach(() => {
  unregister();
  act(() => root.unmount());
  host.remove();
});

it("a rename while the menu is up reaches its header", () => {
  act(() => {
    host
      .querySelector('[data-testid="para"]')!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  expect(headings[headings.length - 1]).toBe("Note: New Note");

  // The note auto-labels (or is renamed); its owner says so.
  rows = { ...rows, heading: { label: "Note", text: "Supplier call follow-ups" } };
  act(() => recordMenuChanged());

  expect(headings[headings.length - 1]).toBe("Note: Supplier call follow-ups");
});
