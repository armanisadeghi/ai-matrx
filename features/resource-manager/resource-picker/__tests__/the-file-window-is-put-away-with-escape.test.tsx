/**
 * THE FILE WINDOW IS PUT AWAY WITH ESCAPE (walk 4, 2026-10-07).
 *
 * A grid's file cell opens this window with Enter. Escape left it open and the cell stuck on
 * "Choosing…", with no keyboard way back to the grid. The window now asks its panel to close on
 * Escape — the panel's own rule keeps the key for any menu or popover inside it, and for a window
 * stacked above. Closing resolves the cell's ask with nothing picked, so the cell closes unchanged.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const panelProps: Array<Record<string, unknown>> = [];
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    panelProps.push(props);
    return <div>{props.children}</div>;
  },
}));
jest.mock("../FilesResourcePicker", () => ({ FilesResourcePicker: () => null }));
jest.mock("../InlineUploadArea", () => ({ InlineUploadArea: () => null }));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({ EntityOrgFilter: () => null }));

import { FilePickerWindow } from "../FilePickerWindow";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  panelProps.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("the file window closes on Escape, through the one close it already has", () => {
  const onClose = jest.fn();
  act(() => root.render(<FilePickerWindow open onClose={onClose} onPick={() => {}} scopeId="volunteers" title="Attach a file" />));
  const panel = panelProps.at(-1)!;
  expect(panel.closeOnEscape).toBe(true);
  expect(panel.onClose).toBe(onClose);
});
