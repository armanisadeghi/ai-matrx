/**
 * THE GOOGLE TASKS IMPORT CONTROL NEVER OPENS WITH NO ORGANIZATION SELECTED.
 *
 * THE DEFECT THIS PINS. Main (`5195c909`) deleted
 * `selectEffectiveOrganizationId` — the selector that quietly substituted the
 * personal workspace whenever nothing was explicitly selected — because the
 * platform law forbids inventing an organization below the boundary. This
 * component read that selector to build the overlay `data` it hands
 * `useOpenGoogleTasksImport`. Swapping straight to `selectOrganizationId`
 * (the organization the person actually picked) means the value can now be
 * `null` in steady state; opening the import window with `organizationId:
 * null` would be a dead press — `GoogleTasksImportPanel` already refuses to
 * load without one. This proves the control itself refuses honestly instead:
 * disabled, with its reason, and the opener is never called.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let mockOrganizationId: string | null = "org-9";
/** Has boot ANSWERED the organization question? The second state, named. */
let mockBootstrapResolved = true;
const openGoogleTasksImport = jest.fn();

jest.mock("@ai-matrx/tap-target/buttons", () => ({
  PanelLeftTapButton: () => null,
  MenuTapButton: () => null,
}));

jest.mock("@/features/resizable-panels/PanelControlProvider", () => ({
  usePanelControls: () => ({
    toggle: jest.fn(),
    isCollapsed: () => false,
  }),
}));

jest.mock("@/features/tasks/components/TasksAssistStrip", () => ({
  TasksAssistStrip: () => null,
}));

jest.mock("@/features/mandates/components/MandateDoorLink", () => ({
  MandateDoorLink: () => null,
}));

jest.mock("@/features/hr/entry-points/HrTasksDoor", () => ({
  HrTasksDoor: () => null,
}));

jest.mock("@/features/tasks/redux/taskUiSlice", () => ({
  selectSelectedTaskId: () => null,
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => mockOrganizationId,
  selectShouldPromptForOrganization: () =>
    mockBootstrapResolved && mockOrganizationId == null,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("@/features/overlays/openers/googleImportWindows", () => ({
  useOpenGoogleTasksImport: () => openGoogleTasksImport,
}));

import { TasksHeaderControls } from "../TasksHeaderControls";

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<TasksHeaderControls />);
  });
}

function importButton() {
  return [...container.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").includes("Import from Google Tasks"),
  );
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  openGoogleTasksImport.mockReset();
});

describe("the Import from Google Tasks control", () => {
  it("opens the import window with the selected organization", () => {
    mockOrganizationId = "org-9";
    mockBootstrapResolved = true;
    mount();

    const button = importButton();
    expect(button).toBeDefined();
    expect(button?.disabled).toBe(false);

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openGoogleTasksImport).toHaveBeenCalledTimes(1);
    expect(openGoogleTasksImport).toHaveBeenCalledWith({
      organizationId: "org-9",
    });
  });

  it("refuses honestly and never opens the opener with no organization selected", () => {
    mockOrganizationId = null;
    mockBootstrapResolved = true;
    mount();

    const button = importButton();
    expect(button).toBeDefined();
    expect(button?.disabled).toBe(true);
    expect(button?.title).toBe(
      "Select an organization before importing Google Tasks.",
    );

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openGoogleTasksImport).not.toHaveBeenCalled();
  });
});
