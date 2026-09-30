/**
 * THE FILE WINDOW LISTS EVERYTHING AND UPLOADS WHERE IT IS TOLD (AO-168, active-org law 2026-09-30).
 *
 * What the window LISTS and where an upload GOES are two separate things. The list spans every
 * organization the person is in (a visible organization filter, starting at All organizations); an
 * upload goes to the organization the caller names (a table's), or — unnamed — the active one
 * through the upload gate. The old single `organizationId` did both, so a clinic table's window
 * hid the person's files in their other organizations.
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

jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({
  EntityOrgFilter: (props: { orgId: string | null; onChange: (o: string | null) => void }) => (
    <button data-org-filter={props.orgId ?? "all"} onClick={() => props.onChange(OTHER)}>
      {props.orgId ?? "All organizations"}
    </button>
  ),
}));

import { FilePickerWindow } from "../FilePickerWindow";

const CLINIC = "57f2a22b-5875-46c6-80df-437076421c28";
const OTHER = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
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

describe("FilePickerWindow organization", () => {
  it("a named upload organization files the upload there and does NOT narrow the list", () => {
    act(() => root.render(<FilePickerWindow open onClose={() => {}} onPick={() => {}} scopeId="t" uploadOrganizationId={CLINIC} />));
    expect(pickerProps.at(-1)?.organizationId ?? null).toBeNull();
    expect(uploadProps.at(-1)).toMatchObject({ organizationId: CLINIC });
    expect(container.querySelector("[data-org-filter]")?.getAttribute("data-org-filter")).toBe("all");
  });

  it("without one, the list is every file and the upload goes to the active organization (no override)", () => {
    act(() => root.render(<FilePickerWindow open onClose={() => {}} onPick={() => {}} scopeId="t" />));
    expect(pickerProps.at(-1)?.organizationId ?? null).toBeNull();
    expect(uploadProps.at(-1)?.organizationId ?? null).toBeNull();
  });

  it("the visible filter narrows the LIST only, never the upload target", () => {
    act(() => root.render(<FilePickerWindow open onClose={() => {}} onPick={() => {}} scopeId="t" uploadOrganizationId={CLINIC} />));
    act(() => {
      (container.querySelector("[data-org-filter]") as HTMLButtonElement).click();
    });
    expect(pickerProps.at(-1)).toMatchObject({ organizationId: OTHER });
    expect(uploadProps.at(-1)).toMatchObject({ organizationId: CLINIC });
  });
});
