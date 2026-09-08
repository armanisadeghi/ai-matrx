/**
 * ── THE TWO AFFORDANCES FIX-R9-UI DELETED, BACK INSIDE THE THREE CONTROLS ────
 *
 * 🚨 FIX-R13/B. FIX-R9-UI met D19 by deleting the JOB cell and the two doors
 * under the old verdict on the admin host, and said so loudly in its own
 * record. Two of those deletions cost the reader something nothing else on
 * that page provides:
 *
 *   1. **the coverage fact** — `coverageLine()`, *"Every input this holder
 *      needs is fed — all 3."* / *"1 required input is still unmapped, and a
 *      run would refuse."* It is the ONLY statement on that page of whether
 *      what the job offers actually feeds what the holder needs;
 *   2. **a door to the assigned agent** — FIX-R9-UI called it *"the one worth
 *      arguing about"*. Arman then ruled (2026-09-08) that the door belongs
 *      INSIDE the picker, which already carries it; section 2 below now pins
 *      that reading instead.
 *
 * They come back as ONE LINE and ONE LINK, inside the block, and D19 must not
 * regress with them: this file re-counts the three controls and fails on a
 * fourth. The link goes through FIX-R10-ADDR's addressing helper and nothing
 * else — a builtin agent lands on the ADMINISTRATION shell, a user agent on
 * `/agents/<id>`; a hand-built `/agents/${id}` here would be a dead link for
 * exactly the holder this page most often names.
 *
 * RED against the tree at `5c9e56eedc`: no coverage line and no agent link
 * rendered inside the holder block at all.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/agents/catalog/react", () => ({
  // Spread the REAL module: this entry also carries `SORT_OPTIONS`, which the
  // agents-hub surface manifest reads at module scope. Replacing the whole
  // entry with one stub component used to blow up an unrelated import chain.
  ...jest.requireActual("@ai-matrx/agents/catalog/react"),
    AgentListDropdown: ({ label }: { label?: string }) => (
      <button data-testid="agent-picker">{label}</button>
    ),
  }),
);
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectBuiltinAgents: () => [{ id: SYSTEM_AGENT }],
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
  fetchAgentVersionHistory: () => ({ type: "noop" }),
}));
jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));
jest.mock("@/features/workflow-runtime/listings/WorkflowListDropdown", () => ({
  WorkflowListDropdown: () => <div data-testid="workflow-picker" />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));

import { ScopeHolderBar } from "@/features/bindings/ScopeHolderBar";
import {
  __resetAgentAddressCache,
  seedAgentAddress,
} from "@/features/agents/addressing/agentAddressCache";


/** `research_client.output_slides`' real holder — a BUILTIN (system) agent. */
const SYSTEM_AGENT = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";

const HOLDER_NAME = "Research → Slides Generator";
const COVERAGE = "Every input this holder needs is fed — all 3.";
const UNFED = "1 required input is still unmapped, and a run would refuse.";

const JOB = {
  mandateKey: "research_client.output_slides",
  label: "Research Output: Slides",
  outputKind: "presentation_deck",
  offeredCount: 3,
  offerSourceLine: "Offered by the research report provision.",
  coverageLine: COVERAGE,
};

function render(opts: {
  perspective?: "person" | "system";
  agentId?: string | null;
  coverageLine?: string;
}): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung={opts.perspective === "person" ? "user" : "system"}
        organizationId={null}
        allowGlobal
        fixedRung={opts.perspective === "person" ? undefined : ["system", "global"]}
        perspective={opts.perspective ?? "system"}
        onRungChange={() => undefined}
        holder={{
          kind: "agent",
          agentId: opts.agentId === undefined ? SYSTEM_AGENT : opts.agentId,
          agentVersionId: null,
          useLatest: true,
          workflowId: null,
        }}
        onHolderChange={() => undefined}
        holderName={HOLDER_NAME}
        job={{ ...JOB, coverageLine: opts.coverageLine ?? COVERAGE }}
        ladderLine="ignored on this host"
      />,
    );
  });
  return { container, root };
}

beforeEach(() => {
  __resetAgentAddressCache();
});

// ── 1. THE COVERAGE FACT ────────────────────────────────────────────────────

describe("the coverage fact is inside the holder block, on the host that lost it", () => {
  it("renders the line the JOB cell used to carry", () => {
    seedAgentAddress({ agentId: SYSTEM_AGENT, agentType: "builtin" });
    const { container, root } = render({});
    const line = container.querySelector('[data-testid="holder-coverage-line"]');
    expect(line?.textContent).toBe(COVERAGE);
    act(() => root.unmount());
  });

  it("is honest when the coverage is NOT complete", () => {
    seedAgentAddress({ agentId: SYSTEM_AGENT, agentType: "builtin" });
    const { container, root } = render({ coverageLine: UNFED });
    expect(
      container.querySelector('[data-testid="holder-coverage-line"]')?.textContent,
    ).toBe(UNFED);
    act(() => root.unmount());
  });

  it("is NOT repeated on a host that still has a JOB cell", () => {
    const { container, root } = render({ perspective: "person" });
    // The person's host keeps it in the JOB cell — once on the page, never
    // twice, which is the repetition Arman rejected by name.
    expect(
      container.querySelectorAll('[data-testid="holder-coverage-line"]').length,
    ).toBe(0);
    expect(container.textContent).toContain(COVERAGE);
    act(() => root.unmount());
  });
});

// ── 2. THE DOOR LIVES INSIDE THE PICKER, NOT BESIDE IT ──────────────────────
//
// 🚨 SUPERSEDED BY ARMAN, 2026-09-08: *"The agent dropdown is written to be a
// self-reliant and inclusive system that doesn't require all of this extra
// trash around it! … Allow it to work naturally to show the selected agent and
// all links and information come up within it so there is no need for anything
// else."*
//
// FIX-R13/B restored the door as a link BESIDE the picker, together with a
// second copy of the name and the raw uuid. Nothing was gained: the picker's
// own detail card already carries open-in-chat, open-in-new-tab (through the
// always-valid `/agents/go/<id>` resolver, which is what made a BUILTIN holder
// reachable in the first place), the sneak peek, favorite and copy. So the
// cluster is deleted and what remains is asserted here: the picker NAMES the
// holder, and nothing outside it repeats the name, prints the id, or offers a
// second door.

describe("the assigned agent is stated by the picker alone", () => {
  it("puts the holder's name on the picker's trigger", () => {
    const { container, root } = render({});
    expect(
      container.querySelector('[data-testid="agent-picker"]')?.textContent,
    ).toBe(HOLDER_NAME);
    act(() => root.unmount());
  });

  it("prints no raw id, no second name and no separate door beside it", () => {
    const { container, root } = render({});
    const text = container.textContent ?? "";
    expect(container.querySelector('[data-testid="holder-agent-id"]')).toBeNull();
    expect(container.querySelector('[data-testid="holder-agent-link"]')).toBeNull();
    expect(text).not.toContain(SYSTEM_AGENT);
    expect(text).not.toContain("Open it");
    expect(text.split(HOLDER_NAME).length - 1).toBe(1);
    act(() => root.unmount());
  });

  it("says to choose one when there is no holder — never an empty control", () => {
    const { container, root } = render({ agentId: null });
    expect(
      container.querySelector('[data-testid="agent-picker"]')?.textContent,
    ).toBe("Choose an agent");
    act(() => root.unmount());
  });
});

// ── 3. D19 DOES NOT REGRESS ─────────────────────────────────────────────────

describe("D19 still holds with both affordances back", () => {
  it("is still exactly three controls, and no fourth", () => {
    seedAgentAddress({ agentId: SYSTEM_AGENT, agentType: "builtin" });
    const { container, root } = render({});
    for (const control of ["type", "assignment", "version"] as const) {
      expect(
        container.querySelectorAll(`[data-holder-control="${control}"]`).length,
      ).toBe(1);
    }
    expect(container.querySelectorAll("[data-holder-control]").length).toBe(3);
    // A line and a link are FACTS, not controls — neither may grow a
    // `data-holder-control` of its own.
    expect(
      container
        .querySelector('[data-testid="holder-coverage-line"]')
        ?.hasAttribute("data-holder-control"),
    ).toBe(false);
    act(() => root.unmount());
  });

  it("renders ONE holder block on the admin host", () => {
    seedAgentAddress({ agentId: SYSTEM_AGENT, agentType: "builtin" });
    const { container, root } = render({});
    expect(container.querySelectorAll('[data-testid="agent-picker"]').length).toBe(
      1,
    );
    act(() => root.unmount());
  });
});
