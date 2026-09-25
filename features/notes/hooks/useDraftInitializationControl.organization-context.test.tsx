// ORG-GATE-AUDIT regression. The notes "+" controls (NotesWindow's New note,
// NotesTreeView's create note/folder, FolderQuickPick) now ASK through
// useNewNoteOrganization instead of refusing. Closing that picker throws
// OrganizationSelectionCancelled — an answer ("not now"), never a failure — so
// the shared control must show no error line and no toast for it.
const toastError = jest.fn();
const toastErrorAlreadyCaptured = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), dismiss: jest.fn() },
  toastErrorAlreadyCaptured: (...a: unknown[]) => toastErrorAlreadyCaptured(...a),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { useDraftInitializationControl } from "./useDraftInitializationControl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Control = ReturnType<typeof useDraftInitializationControl>;

it("closing the organization picker is not a failure: no toast, no error line", async () => {
  let control: Control | null = null;
  function Surface() {
    control = useDraftInitializationControl();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Surface />));

  await act(async () => {
    await (control as unknown as Control)
      .run(async () => {
        throw new OrganizationSelectionCancelled();
      })
      .catch(() => undefined);
  });

  expect(toastError).not.toHaveBeenCalled();
  expect(toastErrorAlreadyCaptured).not.toHaveBeenCalled();
  expect((control as unknown as Control).error).toBeNull();
  expect((control as unknown as Control).pending).toBe(false);
  act(() => root.unmount());
});
