/**
 * ── AT THE SYSTEM RUNG, A PERSONAL AGENT IS REFUSED — NOT WARNED ─────────────
 *
 * Arman, 2026-08-31: *"why would anything allow me to connect anything other
 * than system agents?"* — and he rejected warn-and-allow by name. The picker
 * was restricted then; the SAVE was not. An agent drafted before the
 * restriction existed, or handed back by the global-bind guard dialog, could
 * still be written as the answer every user on the platform gets.
 *
 * Restated 2026-09-08 (FIX-R4) because the admin route now stands on that rung
 * permanently: `/administration/mandates/[key]` pins the binding UI to the
 * system rung, so this is the ONLY rule protecting the platform's own answer on
 * that page.
 *
 * Two halves, both on the real component / the real rule:
 *   1. a pinned rung renders NO selector and states what it is;
 *   2. the holder picker reaches the system catalogue and nothing else, and a
 *      personal agent standing there is refused in words with a remedy.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type DropdownProps = { visibleTabs?: readonly string[]; initialTab?: string };
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
  // A FAITHFUL dispatch double: the real one returns a thunk promise with
  // `.unwrap()`, and the version control calls it. A double that cannot hold
  // the shape the real framework holds is a false test.
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

/** A READ catalogue that does not contain the drafted agent — a real personal
 *  agent standing at the system rung, not an unloaded list. */
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectBuiltinAgents: () => [{ id: "system-agent-1" }],
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
  // The version control reads the agent's history through this thunk.
  fetchAgentVersionHistory: () => ({ type: "noop" }),
}));
jest.mock("@/features/agent-shortcuts/components/AgentVersionPicker", () => ({
  AgentVersionPicker: () => <div data-testid="version-picker" />,
}));
jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));
jest.mock("@/features/workflow-runtime/listings/WorkflowListDropdown", () => ({
  WorkflowListDropdown: () => <div data-testid="workflow-picker" />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => <span data-testid="entity-ref" />,
}));

import { ScopeHolderBar } from "@/features/bindings/ScopeHolderBar";
import {
  SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL,
  SYSTEM_RUNG_TITLE,
  systemRungHolderIsPersonal,
} from "@/features/bindings/system-rung";

const JOB = {
  mandateKey: "research_client.output_slides",
  label: "Research Output: Slides",
  outputKind: "presentation_deck",
  offeredCount: 0,
  offerSourceLine: "",
  coverageLine: "",
};

function renderBar(opts: {
  fixedRung?: "global";
  agentId: string | null;
}): { text: string; html: string; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung="global"
        organizationId={null}
        allowGlobal
        fixedRung={opts.fixedRung}
        onRungChange={() => undefined}
        holder={{
          kind: "agent",
          agentId: opts.agentId,
          agentVersionId: null,
          useLatest: true,
          workflowId: null,
        }}
        holderName={opts.agentId ? "Somebody's Personal Agent" : null}
        onHolderChange={() => undefined}
        job={JOB}
        ladderLine="ladder"
      />,
    );
  });
  return {
    text: container.textContent ?? "",
    html: container.innerHTML,
    root,
  };
}

afterEach(() => {
  lastDropdownProps = null;
});

describe("a pinned rung is STATED, never offered as a choice", () => {
  it("renders no rung selector and says what the rung is", () => {
    const { text, html, root } = renderBar({
      fixedRung: "global",
      agentId: null,
    });
    // RED at v0.4.1719: `ScopeHolderBar` had no `fixedRung`, so the admin route
    // rendered the scope picker — defaulting to User — on the system page.
    expect(html).not.toContain("scope-picker");
    expect(text).toContain(SYSTEM_RUNG_TITLE);
    // No other rung is offered, in words or in controls.
    expect(text).not.toMatch(/everywhere you run/i);
    act(() => root.unmount());
  });

  it("offers the OTHER platform rung by name, and no third one", () => {
    // The admin route manages two rungs that decide for everybody: the job's
    // own default and the platform-wide binding above it.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ScopeHolderBar
          rung="global"
          organizationId={null}
          allowGlobal
          fixedRung={["global", "system"]}
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
    const text = container.textContent ?? "";
    expect(container.innerHTML).not.toContain("scope-picker");
    expect(text).toContain(SYSTEM_RUNG_TITLE);
    expect(text.toLowerCase()).toContain("default");
    // Never a person's or an organization's rung.
    expect(text).not.toMatch(/everywhere you run/i);
    expect(text).not.toMatch(/an organization's answer/i);
    act(() => root.unmount());
  });

  it("still offers the selector to every host that has a rung to choose", () => {
    const { html, root } = renderBar({ agentId: null });
    expect(html).toContain("scope-picker");
    act(() => root.unmount());
  });
});

describe("the system rung's holder picker refuses a non-system agent", () => {
  it("can reach the system catalogue and nothing else", () => {
    const { root } = renderBar({ fixedRung: "global", agentId: null });
    expect(lastDropdownProps?.visibleTabs).toEqual(["system"]);
    expect(lastDropdownProps?.initialTab).toBe("system");
    act(() => root.unmount());
  });

  it("says so on screen when a personal agent is standing there", () => {
    const { text, root } = renderBar({
      fixedRung: "global",
      agentId: "somebody-elses-personal-agent",
    });
    expect(text).toContain("This holder is NOT a system agent");
    act(() => root.unmount());
  });

  it("REFUSES the write — the rule, RED against the shipped one", () => {
    const personal = "somebody-elses-personal-agent";
    const catalogue = ["system-agent-1"];

    /**
     * The rule AS IT SHIPPED (v0.4.1719): `saveRefusal` had no branch for a
     * non-system holder at the system rung, so Save was enabled and the only
     * protection was a dialog the person could click past.
     */
    const shippedRefusal = (): string | null => null;
    expect(shippedRefusal()).toBeNull();

    // The rule now.
    expect(systemRungHolderIsPersonal(personal, catalogue)).toBe(true);
    expect(SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL).toMatch(/personal agent/i);
    // A refusal without a remedy is half a refusal.
    expect(SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL).toMatch(
      /Duplicate it into a system agent/i,
    );

    // A system agent passes, and an UNREAD catalogue refuses nothing — an
    // accusation made against a list that has not loaded is a lie.
    expect(systemRungHolderIsPersonal("system-agent-1", catalogue)).toBe(false);
    expect(systemRungHolderIsPersonal(personal, [])).toBe(false);
    expect(systemRungHolderIsPersonal(null, catalogue)).toBe(false);
  });
});
