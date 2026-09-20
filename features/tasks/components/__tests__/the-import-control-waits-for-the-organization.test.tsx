/**
 * 🚨 VERIFY-R7-FIX-WAVE NEW-1 (seat-proven 2026-09-18) — the Tasks import
 * control announced the TERMINAL refusal while boot was still resolving:
 *
 *   @4048ms  disabled title="Select an organization before importing Google Tasks."
 *   +9571ms  GET /rest/v1/organizations?…            ← the memberships read
 *   @17395ms disabled title="Select an organization before importing Google Tasks."
 *   @20601ms disabled=null title=null                ← the org was always there
 *
 * The person had an organization the whole time. `TasksHeaderControls` read the
 * bare `selectOrganizationId`, which is `null` in BOTH the resolving and the
 * settled-with-nothing states, so it could not tell a race from a fact.
 *
 * This proves the states, from the seat's own point of view:
 *
 *   resolving   → disabled, and the title says it is CHECKING (never the refusal);
 *   required    → ENABLED, with the honest refusal, and the press OPENS THE
 *                 PICKER (2026-09-19 — see below);
 *   unavailable → ENABLED, and the press re-runs the organization read;
 *   ready       → enabled, no title, and the window opens with the org.
 *
 * 🚨 WHAT THE `required` CASE USED TO ASSERT, AND WHY IT IS NOW THE FAILURE
 * MODE (Arman, 2026-09-19). "once boot has SETTLED with nothing: the honest
 * refusal, with its remedy" asserted `button.disabled === true` and the title
 * "Select an organization before importing Google Tasks." — and called that a
 * remedy. It is not one. The control went dead and the sentence sent the
 * person off the page to find an organization picker, which is the dead end
 * that pushed every boot ladder in this codebase to GUESS an organization
 * rather than end without one:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * The ruling makes the refusal a QUESTION with the answer attached: the button
 * stays LIVE, its sentence is now "Choose an organization before importing
 * Google Tasks.", and pressing it opens the ONE picker. The import opener is
 * still never called without an organization — that half of the old case is
 * the part that was always right, and it is asserted harder now: the picker
 * opens, the opener does not, and the opener runs only with the organization
 * the PERSON set (and not at all if they cancel).
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gate = {
  organizationId: null as string | null,
  organizationRequired: false,
  /** The FOURTH state: the read itself failed (R37). */
  readFailed: null as string | null,
};

const opened: { organizationId: string | null }[] = [];
const retried: unknown[] = [];

// The REAL hook and the REAL control gate run; only the store underneath them is
// stood in for, because the three states are a property of that store's two
// facts (`organization_id`, `orgBootstrapResolved`) and nothing else.
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      // THE FIXTURE LAW: the slice builds its own state, so a field the gate
      // learns tomorrow costs this file nothing.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      appContext: require("@/lib/redux/slices/appContextSlice").makeAppContextState({
        organization_id: gate.organizationId,
        orgBootstrapResolved:
          gate.organizationRequired ||
          gate.organizationId != null ||
          gate.readFailed != null,
        orgBootstrapFailure: gate.readFailed,
      }),
      taskUi: { selectedTaskId: null },
    }),
  useAppDispatch: () => () => {},
}));

// The retry the fourth state's press must reach — the ONE bootstrap re-run,
// dispatched through the store singleton (a pure leaf, so no surface test needs
// to know it exists).
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    dispatch: (action: unknown) => {
      retried.push(action);
      return action;
    },
  }),
}));
jest.mock("@/features/tasks/redux/taskUiSlice", () => ({
  selectSelectedTaskId: () => null,
}));
jest.mock("@/features/resizable-panels/PanelControlProvider", () => ({
  usePanelControls: () => ({ toggle: () => {}, isCollapsed: () => false }),
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
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  PanelLeftTapButton: () => null,
  MenuTapButton: () => null,
}));
jest.mock("@/features/overlays/openers/googleImportWindows", () => ({
  useOpenGoogleTasksImport: () => (opts: { organizationId: string | null }) => {
    opened.push(opts);
  },
}));

// The ONE picker the refusal now opens (2026-09-19). Only
// `ensureOrganizationContext` is stood in; `OrganizationSelectionCancelled`
// stays the real class so the cancel case is proved against the error the real
// gate throws.
const ensureOrganizationContext =
  jest.fn<Promise<string>, [unknown?]>();
jest.mock("@/lib/organization/organization-gate", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...(jest.requireActual("@/lib/organization/organization-gate") as object),
  ensureOrganizationContext: (options?: unknown) =>
    ensureOrganizationContext(options),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OrganizationSelectionCancelled } =
  require("@/lib/organization/organization-gate") as typeof import("@/lib/organization/organization-gate");

/** Let the gate's promise chain settle before reading what the press did. */
const settleGate = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TasksHeaderControls } = require("@/features/tasks/components/TasksHeaderControls") as {
  TasksHeaderControls: React.ComponentType;
};

function render(): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<TasksHeaderControls />);
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function importButton(host: HTMLElement): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").includes("Import from Google Tasks"),
  );
  if (!found) throw new Error("the import control did not render at all");
  return found as HTMLButtonElement;
}

describe("the Tasks import control and the three organization states", () => {
  beforeEach(() => {
    gate.organizationId = null;
    gate.organizationRequired = false;
    gate.readFailed = null;
    opened.length = 0;
    retried.length = 0;
    ensureOrganizationContext.mockReset();
  });

  it("while boot is RESOLVING: disabled, says it is checking, and never the refusal", () => {
    const { host, unmount } = render();
    try {
      const button = importButton(host);
      expect(button.disabled).toBe(true);
      const title = button.getAttribute("title") ?? "";
      // The lie NEW-1 caught, in the person's own words.
      expect(title).not.toMatch(/Select an organization/);
      expect(title).toMatch(/Checking which organization/i);
      // And nothing is opened even if the press gets through.
      button.click();
      expect(opened).toEqual([]);
    } finally {
      unmount();
    }
  });

  it("once boot has SETTLED with nothing: the refusal is a QUESTION — pressable, and the press opens the PICKER", async () => {
    gate.organizationRequired = true;
    ensureOrganizationContext.mockResolvedValue("org-the-person-chose");
    const { host, unmount } = render();
    try {
      const button = importButton(host);
      // Asserted `true` until 2026-09-19. A dead button with a sentence telling
      // the person to go elsewhere is the dead end the ruling closes.
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("title")).toBe(
        "Choose an organization before importing Google Tasks.",
      );
      // …and the old sentence is gone with the old posture.
      expect(button.getAttribute("title")).not.toMatch(/Select an organization/);

      act(() => {
        button.click();
      });
      // The PICKER opens — not the Google Tasks window, which has no
      // organization to import into yet. That half was always right.
      expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
      expect(opened).toEqual([]);
      expect(retried).toEqual([]);

      // …and once the person has set one, the import opens with THAT
      // organization, no second press needed.
      await act(async () => {
        await settleGate();
      });
      expect(opened).toEqual([{ organizationId: "org-the-person-chose" }]);
    } finally {
      unmount();
    }
  });

  it("CANCELLING the picker opens nothing and says nothing — the person is exactly where they were", async () => {
    gate.organizationRequired = true;
    ensureOrganizationContext.mockRejectedValue(new OrganizationSelectionCancelled());
    const errored = jest.spyOn(console, "error").mockImplementation(() => {});
    const { host, unmount } = render();
    try {
      act(() => {
        importButton(host).click();
      });
      await act(async () => {
        await settleGate();
      });
      expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
      expect(opened).toEqual([]);
      expect(errored).not.toHaveBeenCalled();
    } finally {
      errored.mockRestore();
      unmount();
    }
  });

  /**
   * 🚨 V-24 NEW-3 (seat-proven 2026-09-18) — the fourth state's sentence named a
   * remedy this page did not have. With every Supabase read aborted the control
   * sat at "We could not check which organization you are working in. Try
   * again." and the ONLY Try again on /tasks belonged to the task list:
   * pressing it left the control exactly where it was for the whole 20s that
   * was then sampled. The sentence must name a button that is there, and the
   * only button that can be is this one.
   */
  it("when the READ FAILED: pressable, and the press re-runs the organization read", () => {
    gate.readFailed = "the organization read failed: Failed to fetch";
    const { host, unmount } = render();
    try {
      const button = importButton(host);
      const title = button.getAttribute("title") ?? "";
      expect(title).not.toMatch(/Select an organization/);
      expect(title).toBe(
        "We could not check which organization you are working in. Press to try again.",
      );
      // The remedy the sentence names is THIS control.
      expect(button.disabled).toBe(false);
      act(() => {
        button.click();
      });
      expect(retried).toEqual([{ type: "test/retry-organization-read" }]);
      // And it opened nothing: there is no organization to import into yet.
      expect(opened).toEqual([]);
    } finally {
      unmount();
    }
  });

  it("with an organization: enabled, no title, and the window carries the org", () => {
    gate.organizationId = "11111111-2222-3333-4444-555555555555";
    const { host, unmount } = render();
    try {
      const button = importButton(host);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("title")).toBeNull();
      act(() => {
        button.click();
      });
      expect(opened).toEqual([
        { organizationId: "11111111-2222-3333-4444-555555555555" },
      ]);
    } finally {
      unmount();
    }
  });
});
