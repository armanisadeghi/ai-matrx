/**
 * @jest-environment jsdom
 *
 * `useCellUndo` runs on the design-system's pure `cell-undo` stack (merge step 2,
 * 2026-09-25). These cases pin what the hook itself owns on top of that stack:
 * an undo/redo is a real write through `upsertCell` with the captured value, the
 * stack moves ONLY when that write landed, and a fresh edit clears the redo
 * branch.
 *
 * The use case: a dispatcher on a Service Calls table changes a job's Status
 * from "Scheduled" to "On site" by mistake and presses Cmd-Z.
 */
import { renderHook } from "@/test-utils/renderHook";

const upsertCell = jest.fn();
jest.mock("../../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { useCellUndo, type CellEdit } from "../useCellUndo";

const statusEdit = (priorValue: string, nextValue: string): CellEdit => ({
  tableId: "service-calls",
  rowId: "job-006",
  fieldName: "status",
  fieldDisplayName: "Status",
  priorValue,
  nextValue,
});

function harness() {
  const applied: Array<[string, unknown]> = [];
  return {
    applied,
    render: () =>
      renderHook(() =>
        useCellUndo({
          readOnly: false,
          onApplied: (edit, value) => applied.push([edit.fieldName, value]),
        }),
      ),
  };
}

beforeEach(() => upsertCell.mockReset());

it("undo writes the value captured BEFORE the edit, then redo writes the new one", async () => {
  upsertCell.mockResolvedValue({ success: true, data: null });
  const h = harness();
  const hook = await h.render();

  await hook.act(() => hook.current.record(statusEdit("Scheduled", "On site")));
  expect(hook.current.canUndo).toBe(true);
  expect(hook.current.canRedo).toBe(false);

  await hook.act(() => hook.current.undo());
  expect(upsertCell).toHaveBeenLastCalledWith({
    tableId: "service-calls",
    rowId: "job-006",
    fieldName: "status",
    value: "Scheduled",
  });
  expect(hook.current.canUndo).toBe(false);
  expect(hook.current.canRedo).toBe(true);

  await hook.act(() => hook.current.redo());
  expect(upsertCell).toHaveBeenLastCalledWith(
    expect.objectContaining({ value: "On site" }),
  );
  expect(h.applied).toEqual([
    ["status", "Scheduled"],
    ["status", "On site"],
  ]);
  await hook.unmount();
});

it("a refused write leaves the step on the stack so it can be tried again", async () => {
  upsertCell.mockResolvedValue({ success: false, error: "This table is read-only for you" });
  const h = harness();
  const hook = await h.render();

  await hook.act(() => hook.current.record(statusEdit("Scheduled", "On site")));
  await hook.act(() => hook.current.undo());
  expect(upsertCell).toHaveBeenCalledTimes(1);
  expect(hook.current.canUndo).toBe(true);
  expect(hook.current.canRedo).toBe(false);
  expect(h.applied).toEqual([]);
  await hook.unmount();
});

it("a fresh edit after an undo clears the redo branch; reset clears everything", async () => {
  upsertCell.mockResolvedValue({ success: true, data: null });
  const hook = await harness().render();

  await hook.act(() => hook.current.record(statusEdit("Scheduled", "On site")));
  await hook.act(() => hook.current.undo());
  expect(hook.current.canRedo).toBe(true);
  await hook.act(() => hook.current.record(statusEdit("Scheduled", "Invoiced")));
  expect(hook.current.canRedo).toBe(false);
  expect(hook.current.undoDepth).toBe(1);

  await hook.act(() => hook.current.reset());
  expect(hook.current.canUndo).toBe(false);
  expect(hook.current.undoDepth).toBe(0);
  await hook.unmount();
});
