/**
 * @jest-environment jsdom
 *
 * The composer's canvas tab holds a COPY of the chips' items. When the item in
 * front is gone (its edit chip removed by reverting the edit, the message
 * sent) the tab must close — live walk 2026-10-05: it kept showing the stale
 * diff after the revert removed its chip.
 *
 * Use case: Priya opens the diff chip for her edit to the caching answer, then
 * reverts the edit; the chip goes, and so must the diff beside the chat.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toggle = jest.fn();
let tabState: { isVisible: boolean; selected: string | null } = { isVisible: true, selected: "edit-1" };
jest.mock("../../../../host/canvas", () => ({
  useChatCanvasTab: () => ({ isAvailable: true, ...tabState, toggle }),
}));

import { useContextItemsTab } from "../contextItemsTab";

let api: ReturnType<typeof useContextItemsTab> | null = null;
function Probe() {
  api = useContextItemsTab("composer:c1");
  return null;
}

function mount() {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  return () => act(() => root.unmount());
}

beforeEach(() => {
  toggle.mockReset();
  tabState = { isVisible: true, selected: "edit-1" };
});

test("the item in front is gone: the tab closes (press on the item in front)", () => {
  const unmount = mount();
  act(() => api!.closeIfGone(["other-chip"]));
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(toggle.mock.calls[0][0]).toMatchObject({ selected: "edit-1" });
  unmount();
});

test("the item in front still exists: nothing happens", () => {
  const unmount = mount();
  act(() => api!.closeIfGone(["edit-1", "other-chip"]));
  expect(toggle).not.toHaveBeenCalled();
  unmount();
});

test("the tab is closed or behind: nothing to close", () => {
  tabState = { isVisible: false, selected: "edit-1" };
  const unmount = mount();
  act(() => api!.closeIfGone([]));
  expect(toggle).not.toHaveBeenCalled();
  unmount();
});
