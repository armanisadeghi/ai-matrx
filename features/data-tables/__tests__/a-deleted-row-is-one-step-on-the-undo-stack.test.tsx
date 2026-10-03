/**
 * GRIDS REVIEW 3: after Delete row, the toolbar Undo did not bring the row back — the Sheet's one undo
 * stack only held cell values. A row archived by Delete is now one step on it: Cmd-Z / the toolbar Undo
 * / the notice's Undo restore it through the store's door, Redo archives it again.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../service", () => ({ upsertCell: jest.fn(), bulkWrite: jest.fn() }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { useCellUndo } from "../hooks/useCellUndo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("undoes and redoes an archived row through its own doors, and the notice's Undo is the same step", async () => {
  let api: ReturnType<typeof useCellUndo> | null = null;
  function Probe() {
    api = useCellUndo({ onApplied: () => {}, readOnly: false });
    return null;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Probe />));
  const undo = jest.fn().mockResolvedValue(true);
  const redo = jest.fn().mockResolvedValue(true);
  let handle: unknown = null;
  act(() => {
    handle = api!.recordStep({ undo, redo }, 'Delete "Treadmill"');
  });
  expect(api!.canUndo).toBe(true);
  await act(async () => {
    await api!.undo();
  });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(api!.canRedo).toBe(true);
  await act(async () => {
    await api!.redo();
  });
  expect(redo).toHaveBeenCalledTimes(1);
  // The notice's Undo pops the same step.
  await act(async () => {
    await api!.undoThis(handle as never);
  });
  expect(undo).toHaveBeenCalledTimes(2);
  expect(api!.canUndo).toBe(false);
  act(() => root.unmount());
});
