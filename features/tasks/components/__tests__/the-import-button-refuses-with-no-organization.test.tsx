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
 * load without one. This proves the control itself refuses honestly instead,
 * and never hands the opener a null organization.
 *
 * 🚨 WHAT "HONESTLY" USED TO MEAN HERE, AND WHY IT IS NOW THE FAILURE MODE
 * (Arman, 2026-09-19). The case below was "refuses honestly and never opens the
 * opener with no organization selected", and it asserted `button.disabled ===
 * true` with the title "Select an organization before importing Google Tasks."
 * Half of that was right and has never changed: the opener must not be called
 * without an organization. The other half — the dead button — is now the
 * defect. A control that goes dead and tells the person to go find an
 * organization somewhere else is the dead end that pushed every boot ladder in
 * this codebase to GUESS an organization rather than end without one:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * The ruling makes the refusal a QUESTION: the button stays LIVE, its sentence
 * is now "Choose an organization before importing Google Tasks.", and pressing
 * it opens the ONE picker. The opener runs only after the person has SET an
 * organization, and not at all if they cancel — which is what the two cases
 * below assert, so the press can never quietly become a dead press again and
 * can never reach the opener with a value nobody chose.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Without this React logs "The current testing environment is not configured to
// support act(...)" through `console.error` on every render — which would make
// the cancel case below (which proves the press says NOTHING) pass or fail on
// React's own noise rather than on the code under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

// THE FIXTURE LAW (F-107 / F-115): this suite never re-implements the
// organization rule. It builds REAL app-context state through the slice's own
// `makeAppContextState` and lets the real selectors — the slice's
// `selectOrganizationId` and the pure leaves the gate reads — answer. The day
// the gate learns a new input, this file costs nothing; a hand-written
// `selectShouldPromptForOrganization` here silently stopped being consulted
// the day the gate moved to its pure leaf, and the button read "Checking…".
jest.mock("@/lib/redux/hooks", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeAppContextState } = jest.requireActual(
    "@/lib/redux/slices/appContextSlice",
  ) as typeof import("@/lib/redux/slices/appContextSlice");
  return {
    useAppSelector: (selector: (state: unknown) => unknown) =>
      selector({
        appContext: makeAppContextState({
          organization_id: mockOrganizationId,
          orgBootstrapResolved: mockBootstrapResolved,
        }),
      }),
  };
});

jest.mock("@/features/overlays/openers/googleImportWindows", () => ({
  useOpenGoogleTasksImport: () => openGoogleTasksImport,
}));

// The ONE picker the refusal now opens. Only `ensureOrganizationContext` is
// stood in — `OrganizationSelectionCancelled` stays the real class, so the
// cancel case is proved against the error the real gate throws.
const ensureOrganizationContext =
  jest.fn<Promise<string>, [unknown?]>();
jest.mock("@/lib/organization/organization-gate", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...(jest.requireActual("@/lib/organization/organization-gate") as object),
  ensureOrganizationContext: (options?: unknown) =>
    ensureOrganizationContext(options),
}));

import { TasksHeaderControls } from "../TasksHeaderControls";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

/** Let the gate's promise chain settle before reading what the press did. */
const settleGate = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  ensureOrganizationContext.mockReset();
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

  it("with no organization selected: it ASKS — the picker opens, the opener waits, and it runs with what the person set", async () => {
    mockOrganizationId = null;
    mockBootstrapResolved = true;
    ensureOrganizationContext.mockResolvedValue("org-the-person-chose");
    mount();

    const button = importButton();
    expect(button).toBeDefined();
    // `true` until 2026-09-19: the refusal was a wall. It is a question now.
    expect(button?.disabled).toBe(false);
    expect(button?.title).toBe(
      "Choose an organization before importing Google Tasks.",
    );
    expect(button?.title).not.toMatch(/Select an organization/);

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The picker, never the Google Tasks window — the half of this case that
    // was always right. The opener would refuse a null organization anyway.
    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
    expect(openGoogleTasksImport).not.toHaveBeenCalled();

    await act(async () => {
      await settleGate();
    });
    expect(openGoogleTasksImport).toHaveBeenCalledTimes(1);
    expect(openGoogleTasksImport).toHaveBeenCalledWith({
      organizationId: "org-the-person-chose",
    });
  });

  it("and if the person CANCELS the picker, the opener is never called at all", async () => {
    mockOrganizationId = null;
    mockBootstrapResolved = true;
    ensureOrganizationContext.mockRejectedValue(new OrganizationSelectionCancelled());
    const errored = jest.spyOn(console, "error").mockImplementation(() => {});
    mount();

    act(() => {
      importButton()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await settleGate();
    });

    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
    // "Not now" is an answer: nothing opened, nothing said, nothing written.
    expect(openGoogleTasksImport).not.toHaveBeenCalled();
    expect(errored).not.toHaveBeenCalled();
    errored.mockRestore();
  });
});
