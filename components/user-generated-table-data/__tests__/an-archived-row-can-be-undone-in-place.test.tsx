/**
 * AN ARCHIVED ROW CAN BE PUT BACK FROM WHERE IT WAS ARCHIVED (DATA-V2-BASICS-2 F34).
 * Harbor Dental's "Insurance Plan Accounts": Delete on "Guardian Managed DentalGuard · Plan 3310"
 * asked first (good) and then said nothing — the way back was Trash, two pages away. The Sheet now
 * says it was archived and offers Undo, which restores it in place.
 * RED before: no notice after the delete.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const deleteRow = jest.fn(async () => ({ success: true, data: { row_id: "r1", archived_at: "2026-09-27T20:00:00Z" } }));
const restoreArchivedRow = jest.fn(async () => ({ success: true, data: null }));
jest.mock("@/features/data-tables/service", () => ({
  deleteRow: (...a: unknown[]) => deleteRow(...(a as [])),
  restoreArchivedRow: (...a: unknown[]) => restoreArchivedRow(...(a as [])),
  isRecordStoreTable: () => true,
}));
const success = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => success(...a), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import DeleteRowModal from "../DeleteRowModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("Delete archives the plan, says so, and Undo puts it back", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSuccess = jest.fn();
  act(() =>
    root.render(
      <DeleteRowModal tableId="t1" rowId="r1" rowLabel="Guardian Managed DentalGuard · Plan 3310" isOpen onClose={() => {}} onSuccess={onSuccess} />,
    ),
  );
  const del = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Delete")!;
  await act(async () => {
    del.click();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(deleteRow).toHaveBeenCalledWith({ tableId: "t1", rowId: "r1" });
  const [title, opts] = success.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
  expect(title).toContain("Guardian Managed DentalGuard · Plan 3310");
  expect(opts.action.label).toBe("Undo");
  await act(async () => {
    opts.action.onClick();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(restoreArchivedRow).toHaveBeenCalledWith({ tableId: "t1", rowId: "r1" });
  expect(onSuccess).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});
