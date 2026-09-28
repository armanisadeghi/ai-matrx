/**
 * THE FILE WINDOW AN ATTACHMENT CELL OPENS SHOWS THE TABLE'S ORGANIZATION (merged-grid review 2,
 * fix lane F item 4).
 *
 * A clinic's table attaches X-rays kept in the clinic's workspace. The window listed every file the
 * person holds, in every workspace, and an upload asked (or fell back to) some other workspace. The
 * ask now carries the table's organization: the window lists only its files (a FILTER on what is
 * shown, never a permission) and files an upload there.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pickerProps: Array<Record<string, unknown>> = [];
const uploadProps: Array<Record<string, unknown>> = [];
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("../FilesResourcePicker", () => ({
  FilesResourcePicker: (props: Record<string, unknown>) => {
    pickerProps.push(props);
    return <div>{props.topSlot as React.ReactNode}</div>;
  },
}));
jest.mock("../InlineUploadArea", () => ({
  InlineUploadArea: (props: Record<string, unknown>) => {
    uploadProps.push(props);
    return null;
  },
}));

import { FilePickerWindow } from "../FilePickerWindow";

const CLINIC = "57f2a22b-5875-46c6-80df-437076421c28";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pickerProps.length = 0;
  uploadProps.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FilePickerWindow organizationId", () => {
  it("lists and uploads in the organization it was asked for", () => {
    act(() => root.render(<FilePickerWindow open onClose={() => {}} onPick={() => {}} scopeId="t" organizationId={CLINIC} />));
    expect(pickerProps.at(-1)).toMatchObject({ organizationId: CLINIC });
    expect(uploadProps.at(-1)).toMatchObject({ organizationId: CLINIC });
    // The filter says so — an organization with no files must not read as "you have no files".
    expect(container.querySelector(`[data-file-window-organization="${CLINIC}"]`)?.textContent).toContain(
      "Only files in this table's organization are listed",
    );
  });

  it("without one, every file the person holds (unchanged)", () => {
    act(() => root.render(<FilePickerWindow open onClose={() => {}} onPick={() => {}} scopeId="t" />));
    expect(pickerProps.at(-1)?.organizationId ?? null).toBeNull();
    expect(container.querySelector("[data-file-window-organization]")).toBeNull();
  });
});
