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
 *
 * 🚨 HOW THIS SUITE DRIVES THE ORGANIZATION (2026-09-19). It used to stand the
 * app-context slice in with a HAND-WRITTEN `selectShouldPromptForOrganization`
 * over an empty state (`useAppSelector: (selector) => selector({})`) — a second
 * implementation of a platform rule, living in a test. The day the gate started
 * reading that rule from its pure leaf (`lib/organizations/
 * shouldPromptForOrganization.ts`, which nobody mocks, deliberately), the copy
 * in this file stopped being consulted and the real leaf was handed `{}` — no
 * `appContext` at all, which it honestly reads as "boot has not answered yet".
 * The button then said "Checking which organization you are working in…" where
 * this suite expects the refusal, and the suite was right: with a settled boot
 * and nothing selected, the refusal is the truth.
 *
 * The fix is the shape THE FIXTURE LAW (F-107) asks for everywhere: drive REAL
 * state through `makeAppContextState` and let the real selectors answer. No
 * selector is re-implemented here, so the next input the gate learns costs this
 * file nothing.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** THE FIXTURE LAW: the slice builds its own state, and the real selectors read it. */
const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

let appContext = makeAppContextState({
  organization_id: "org-9",
  orgBootstrapResolved: true,
});
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

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
  useAppDispatch: () => jest.fn(),
}));

/** The fourth state's press re-runs the read; nothing here exercises it. */
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: () => {} }),
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
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
    appContext = makeAppContextState({
      organization_id: "org-9",
      orgBootstrapResolved: true,
    });
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
    appContext = makeAppContextState({ orgBootstrapResolved: true });
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

  /**
   * THE FOURTH STATE (R37). With the organization READ itself failed, nobody
   * looked at this person's memberships, so the refusal above would be a claim
   * nobody verified — this control stays pressable and the press asks again.
   * Driving it here costs one fixture field, because the real leaf reads the
   * real state.
   */
  it("stays pressable and never opens the opener when the read FAILED", () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    mount();

    const button = importButton();
    expect(button?.disabled).toBe(false);
    expect(button?.title).toBe(
      "We could not check which organization you are working in. Press to try again.",
    );

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openGoogleTasksImport).not.toHaveBeenCalled();
  });
});
