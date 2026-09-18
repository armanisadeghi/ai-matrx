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
 * This proves the three states, from the seat's own point of view:
 *
 *   resolving → disabled, and the title says it is CHECKING (never the refusal);
 *   required  → disabled, with the honest refusal and its remedy;
 *   ready     → enabled, no title, and the window opens with the org.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gate = {
  organizationId: null as string | null,
  organizationRequired: false,
};

const opened: { organizationId: string | null }[] = [];

// The REAL hook and the REAL control gate run; only the store underneath them is
// stood in for, because the three states are a property of that store's two
// facts (`organization_id`, `orgBootstrapResolved`) and nothing else.
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      appContext: {
        organization_id: gate.organizationId,
        orgBootstrapResolved: gate.organizationRequired || gate.organizationId != null,
      },
      taskUi: { selectedTaskId: null },
    }),
  useAppDispatch: () => () => {},
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
    opened.length = 0;
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

  it("once boot has SETTLED with nothing: the honest refusal, with its remedy", () => {
    gate.organizationRequired = true;
    const { host, unmount } = render();
    try {
      const button = importButton(host);
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("title")).toBe(
        "Select an organization before importing Google Tasks.",
      );
      button.click();
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
