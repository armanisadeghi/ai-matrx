/**
 * @jest-environment jsdom
 *
 * Arman, 2026-09-21: "just after an action runs, we need to make sure we have
 * an easy undo that would guarantee a full recovery." A row action writes many
 * cells at once; ONE undo must put every one of them back, in ONE transaction,
 * whether it comes from Cmd-Z or from the "Undo" on the action's own toast.
 *
 * The use case: an ops lead presses "New Week" on the Claude-accounts tracker
 * for two accounts (Status → AVAILABLE, Total cleared) and realises it was the
 * wrong week.
 */
import { renderHook } from "@/test-utils/renderHook";

const upsertCell = jest.fn();
const bulkWrite = jest.fn();
jest.mock("../../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  bulkWrite: (...args: unknown[]) => bulkWrite(...args),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { useCellUndo, type CellEdit } from "../useCellUndo";

const cell = (rowId: string, fieldName: string, priorValue: unknown, nextValue: unknown): CellEdit => ({
  tableId: "claude-accounts",
  rowId,
  fieldName,
  fieldDisplayName: fieldName,
  priorValue,
  nextValue,
});

const newWeek = [
  cell("acct-main", "status", "EXHAUSTED", "AVAILABLE"),
  cell("acct-main", "total", 412, null),
  cell("acct-backup", "status", "LIMITED", "AVAILABLE"),
  cell("acct-backup", "total", 97, null),
];

async function render() {
  const applied: Array<[string, string, unknown]> = [];
  const hook = await renderHook(() =>
    useCellUndo({ readOnly: false, onApplied: (e, v) => applied.push([e.rowId, e.fieldName, v]) }),
  );
  return { hook, applied };
}

beforeEach(() => {
  upsertCell.mockReset();
  bulkWrite.mockReset();
  bulkWrite.mockResolvedValue({ success: true, data: { table_id: "claude-accounts", results: [] } });
});

it("one Cmd-Z restores every cell the action wrote, in ONE bulk write", async () => {
  const { hook, applied } = await render();
  await hook.act(() => void hook.current.recordGroup(newWeek, "New Week"));
  expect(hook.current.undoDepth).toBe(1);

  await hook.act(() => hook.current.undo());
  expect(upsertCell).not.toHaveBeenCalled();
  expect(bulkWrite).toHaveBeenCalledTimes(1);
  expect(bulkWrite).toHaveBeenCalledWith({
    tableId: "claude-accounts",
    operations: [
      { op: "merge", row_id: "acct-main", data: { status: "EXHAUSTED", total: 412 } },
      { op: "merge", row_id: "acct-backup", data: { status: "LIMITED", total: 97 } },
    ],
  });
  expect(applied).toHaveLength(4);
  expect(hook.current.canUndo).toBe(false);
  expect(hook.current.canRedo).toBe(true);
  await hook.unmount();
});

it("the toast's Undo undoes exactly that action, even after an unrelated later edit", async () => {
  const { hook } = await render();
  let handle: ReturnType<typeof hook.current.recordGroup> = null;
  await hook.act(() => {
    handle = hook.current.recordGroup(newWeek, "New Week");
  });
  // A later, unrelated edit on another cell.
  await hook.act(() => hook.current.record(cell("acct-main", "notes", "", "renews Monday")));
  upsertCell.mockResolvedValue({ success: true, data: null });

  let ok = false;
  await hook.act(async () => {
    ok = await hook.current.undoThis(handle);
  });
  expect(ok).toBe(true);
  expect(bulkWrite).toHaveBeenCalledTimes(1);
  // The later edit is still on the stack and untouched.
  expect(upsertCell).not.toHaveBeenCalled();
  expect(hook.current.undoDepth).toBe(1);
  await hook.unmount();
});

it("refuses to restore over a NEWER edit of the same cell, and writes nothing", async () => {
  const { hook } = await render();
  let handle: ReturnType<typeof hook.current.recordGroup> = null;
  await hook.act(() => {
    handle = hook.current.recordGroup(newWeek, "New Week");
  });
  await hook.act(() => hook.current.record(cell("acct-main", "status", "AVAILABLE", "PAUSED")));

  let ok = true;
  await hook.act(async () => {
    ok = await hook.current.undoThis(handle);
  });
  expect(ok).toBe(false);
  expect(bulkWrite).not.toHaveBeenCalled();
  expect(hook.current.undoDepth).toBe(2);
  await hook.unmount();
});

it("a refused group write keeps the step so it can be tried again", async () => {
  bulkWrite.mockResolvedValue({ success: false, error: "The server is busy" });
  const { hook, applied } = await render();
  await hook.act(() => void hook.current.recordGroup(newWeek, "New Week"));
  await hook.act(() => hook.current.undo());
  expect(hook.current.canUndo).toBe(true);
  expect(applied).toEqual([]);
  await hook.unmount();
});
