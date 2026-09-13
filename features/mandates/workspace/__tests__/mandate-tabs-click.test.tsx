/**
 * ── THE MANDATE WORKSPACE'S TAB BAR ACTUALLY SWITCHES PANELS ─────────────────
 *
 * 🚨 The instance the class was found on (production walk of
 * `manage.aimatrx.com/administration/mandates/<key>`, 2026-09-12): every tab
 * reported `aria-selected="true"` on Definition after activation, and the
 * panel never changed. The cause is the shared tabs primitive — a `click` with
 * no `mousedown` in front of it does not select a Radix tab — and it is guarded
 * where it lives, in `components/ui/__tests__/tabs-click-activates.test.tsx`.
 *
 * WHY THIS SECOND GUARD EXISTS ANYWAY. This workspace keeps EVERY panel in the
 * DOM and hides the inactive ones with `hidden` + a `hidden` class. A test that
 * asserts a panel's markup is present therefore passes whether or not the tab
 * ever switched — which is exactly how the existing suite's `holder.click()`
 * stayed green through the whole life of this defect. The only honest
 * assertions on this page are `aria-selected` and the panel's VISIBILITY, and
 * that is what this file reads.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: () => "org-1",
  useAppStore: () => ({ getState: () => ({}), dispatch: () => undefined }),
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [{ id: "org-1", name: "Write Target Sandbox", role: "admin" }],
  }),
}));
jest.mock("../../useMandate", () => ({
  useMandate: () => ({ mandate: null, loading: false, error: null }),
}));
jest.mock("../useMandateLadder", () => ({
  useMandateLadder: () => ({ rows: [], loading: false, error: null }),
}));
jest.mock("../../useCopyMandateAgent", () => ({
  useCopyMandateAgent: () => ({ copying: false, copyAndOpen: jest.fn() }),
}));
jest.mock("../TriadSections", () => ({
  TriadFlowMark: () => <div />,
  TriadGoalSection: () => <div />,
  TriadInputSection: () => <div />,
  TriadOutputSection: () => <div />,
}));
jest.mock("@/features/shell/components/header/templates/CrumbTrailHeader", () => ({
  CrumbTrailHeader: () => null,
}));
jest.mock("../MandateCoverageAlert", () => ({ MandateCoverageAlert: () => null }));
jest.mock("../MandateProvenancePanel", () => ({ MandateProvenancePanel: () => null }));
jest.mock("../../components/MandateNotesPanel", () => ({
  MandateNotesPanel: () => <div />,
}));
jest.mock("../../components/MandateLineageLine", () => ({
  MandateLineageLine: () => <div />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));
jest.mock("@/components/official/entity-ref/TextWithDoors", () => ({
  TextWithDoors: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock("@/features/bindings/OneBindingWorkspace", () => ({
  OneBindingWorkspace: () => <div data-testid="one-binding" />,
}));
jest.mock("../useMandateWorkspaceData", () => ({
  useMandateWorkspaceData: () => ({
    data: WORKSPACE_DATA,
    loading: false,
    failure: null,
    error: null,
    refresh: () => undefined,
  }),
}));
jest.mock("../../output-contract", () => {
  const actual = jest.requireActual("../../output-contract");
  return {
    ...actual,
    fetchAgentOutputSchemas: (ids: string[]) =>
      Promise.resolve(Object.fromEntries(ids.map((id) => [id, null]))),
  };
});

const WORKSPACE_DATA = {
  mandate: {
    id: "59325dc2-4df9-4eb1-8d77-d4dd0d93a160",
    mandate_key: "research_client.output_slides",
    label: "Research Output: Slides",
    organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
    is_enabled: true,
    output_kind: "presentation_deck",
    default_holder_type: "agent",
    default_holder_id: null,
    default_holder_version_id: null,
    source_mandate_id: null,
    metadata: null,
    auto_context_disabled: false,
  },
  contract: {
    requiredVariables: [],
    requiredContextPolicyKeys: [],
    requiredOutputKeys: [],
    spillVariables: [],
  },
  provisionKey: null,
  pins: {},
  pinnedContext: [],
  offer: null,
  bindings: [],
  agentsById: {},
  versionsById: {},
};

import { MandateWorkspace } from "../MandateWorkspace";

describe("mandate workspace tabs", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  const tabs = () => [
    ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const tab = (label: string) => tabs().find((t) => t.textContent === label)!;
  const selected = () =>
    tabs().find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
  /** VISIBLE, not merely present — every panel stays mounted on this page. */
  const visiblePanel = (id: string) => {
    const panel = container.querySelector<HTMLElement>(`#${id}`);
    return panel !== null && !panel.hidden;
  };

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(<MandateWorkspace mandateKeyOrId="x" host="admin-route" />),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens on Definition", () => {
    expect(selected()).toBe("Definition");
    expect(visiblePanel("mandate-panel-definition")).toBe(true);
    expect(visiblePanel("mandate-panel-holder")).toBe(false);
  });

  it("switches to Holder on a click, and hides the Definition panel", async () => {
    await act(async () => tab("Holder").click());
    expect(selected()).toBe("Holder");
    expect(visiblePanel("mandate-panel-holder")).toBe(true);
    expect(visiblePanel("mandate-panel-definition")).toBe(false);
  });

  it("switches to Overrides on a click", async () => {
    await act(async () => tab("Overrides").click());
    expect(selected()).toBe("Overrides");
    expect(visiblePanel("mandate-panel-overrides")).toBe(true);
    expect(visiblePanel("mandate-panel-definition")).toBe(false);
  });

  it("switches to Notes on a click", async () => {
    await act(async () => tab("Notes").click());
    expect(selected()).toBe("Notes");
    expect(visiblePanel("mandate-panel-notes")).toBe(true);
  });
});
