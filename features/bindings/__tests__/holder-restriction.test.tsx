/**
 * THE GUARD ON WHO MAY HOLD A JOB AT EACH RUNG.
 *
 * 🚨 The defect (Arman, 2026-08-31; VISION-RECONCILIATION D2, confirmed on
 * production): at the SYSTEM rung — *"Everybody on the platform gets this"* —
 * the holder picker opened on the **Mine** tab listing 40 of the admin's own
 * personal agents. `ScopeHolderBar` mounted `AgentListDropdown` with NONE of
 * its restriction props, and the only protection was a save-time warn-and-allow
 * dialog, which he rejected by name: *"why would anything allow me to connect
 * anything other than system agents?"*
 *
 * This test fails against that shape — every assertion below is about a prop
 * the old call site did not pass — and it pins the rule, not one screen:
 *
 *   · system rung → ONLY the system catalogue is reachable;
 *   · org rung    → only agents shared with the organization, or system ones;
 *   · user rung   → unrestricted, deliberately (D3: "on my own user route, my
 *     own agents are fine"), and therefore carrying no sentence.
 *
 * It also pins the SENTENCE, because a restriction the person cannot see is
 * a refusal without a reason.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type DropdownProps = {
  visibleTabs?: readonly string[];
  initialTab?: string;
  includeSystemInAll?: boolean;
};

let lastDropdownProps: DropdownProps | null = null;

jest.mock(
  "@/features/agents/components/agent-listings/AgentListDropdown",
  () => ({
    AgentListDropdown: (props: DropdownProps) => {
      lastDropdownProps = props;
      return <div data-testid="agent-picker" />;
    },
  }),
);

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  // An UNREAD catalogue, deliberately: the violation alert must stay silent
  // until the system agents are actually known. An empty list is "not loaded",
  // never "not a system agent".
  selectBuiltinAgents: () => [],
}));

jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
}));

jest.mock("@/features/agent-shortcuts/components/AgentVersionPicker", () => ({
  AgentVersionPicker: () => <div data-testid="version-picker" />,
}));

jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));

jest.mock("../WorkflowHolderPicker", () => ({
  WorkflowHolderPicker: () => <div data-testid="workflow-picker" />,
}));

jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => <span data-testid="entity-ref" />,
}));

import { ScopeHolderBar, type BindingRung } from "../ScopeHolderBar";

const JOB = {
  mandateKey: "mandate.guard_probe",
  label: "Guard probe",
  outputKind: null,
  offeredCount: 0,
  offerSourceLine: "",
  coverageLine: "",
};

function renderAt(rung: BindingRung): { text: string; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung={rung}
        organizationId={rung === "org" ? "org-1" : null}
        allowGlobal
        onRungChange={() => undefined}
        holder={{
          kind: "agent",
          agentId: null,
          agentVersionId: null,
          useLatest: true,
          workflowId: null,
        }}
        onHolderChange={() => undefined}
        job={JOB}
        ladderLine="ladder"
      />,
    );
  });
  return { text: container.textContent ?? "", root };
}

afterEach(() => {
  lastDropdownProps = null;
});

describe("the holder picker is restricted BY RUNG, at the door", () => {
  it("the system rung can reach the system catalogue and nothing else", () => {
    const { text, root } = renderAt("global");
    expect(lastDropdownProps?.visibleTabs).toEqual(["system"]);
    expect(lastDropdownProps?.initialTab).toBe("system");
    expect(text).toContain("only system agents can be bound here");
    act(() => root.unmount());
  });

  it("the org rung can reach shared and system agents, never personal ones", () => {
    const { text, root } = renderAt("org");
    expect(lastDropdownProps?.visibleTabs).toEqual(["shared", "system"]);
    expect(lastDropdownProps?.visibleTabs).not.toContain("mine");
    expect(text).toContain("only agents shared with the organization");
    act(() => root.unmount());
  });

  it("the user rung is unrestricted and says nothing, because nothing is refused", () => {
    const { root } = renderAt("user");
    expect(lastDropdownProps?.visibleTabs).toBeUndefined();
    expect(lastDropdownProps?.initialTab).toBeUndefined();
    act(() => root.unmount());
  });
});
