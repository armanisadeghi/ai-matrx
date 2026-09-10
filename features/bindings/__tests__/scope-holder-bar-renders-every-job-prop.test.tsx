/**
 * ── A PROP THIS BAR ACCEPTS IS NEVER SILENTLY DROPPED ────────────────────────
 *
 * 🚨 THE CLASS, not the instance. `96e45f3aa2` ("wip: integrate concurrent
 * frontend repairs") replaced `ScopeHolderBar`'s three-cell layout with property
 * rows and deleted the JOB cell wholesale. `coverageLine` was restored the same
 * day because `holder-block-affordances.test.tsx` named it; `label`,
 * `offeredCount` and `offerSourceLine` were NOT, because nothing asserted them.
 * The bar went on declaring them in `ScopeHolderBarProps`, went on being handed
 * them by `OneBindingWorkspace`, and rendered none of them — a caller with every
 * reason to believe the reader saw the job's name, its offer count and where
 * that offer comes from, and a reader who saw nothing. That is the fourth law's
 * silent failure at the component boundary.
 *
 * So this file guards the BOUNDARY rather than three sentences: it renders the
 * bar with every `job` field set to a sentinel and requires each one to reach
 * the reader — as visible text, or (for a field that is a FILTER rather than a
 * fact) as a prop on the named control, which the sentinel proves it arrived on.
 * Add a field to `job` and this fails until you render it or declare where it
 * goes. There is no third option, and "the caller renders it elsewhere" is not
 * one: a prop accepted here is a promise made here.
 *
 * RED against the tree at `56c1eaedc4`: `label`, `offeredCount` and
 * `offerSourceLine` are absent from the DOM.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/agents/catalog/react", () => ({
  ...jest.requireActual("@ai-matrx/agents/catalog/react"),
  AgentListDropdown: ({ label }: { label?: string }) => (
    <button data-testid="agent-picker">{label}</button>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectBuiltinAgents: () => [],
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
  fetchAgentVersionHistory: () => ({ type: "noop" }),
}));
jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));
// The workflow picker is where `outputKind` actually lands — it is a FILTER on
// what may hold this job, not a sentence — so the mock surfaces the prop it was
// handed and the guard reads it back.
jest.mock("@/features/workflow-runtime/listings/WorkflowListDropdown", () => ({
  WorkflowListDropdown: ({
    wantedOutputKind,
  }: {
    wantedOutputKind?: string | null;
  }) => (
    <div
      data-testid="workflow-picker"
      data-wanted-output-kind={wantedOutputKind ?? ""}
    />
  ),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));

import {
  ScopeHolderBar,
  type ScopeHolderBarProps,
} from "@/features/bindings/ScopeHolderBar";

/**
 * Every field of `job`, each a sentinel no other copy on this bar can produce.
 * Typed as the real prop so adding a field to `ScopeHolderBarProps["job"]`
 * breaks the BUILD here before it can be silently dropped at run time.
 */
const JOB: ScopeHolderBarProps["job"] = {
  mandateKey: "guard.job_key",
  label: "Guard Job Display Name",
  outputKind: "guard_output_kind",
  offeredCount: 7,
  offerSourceLine: "Guard sentence naming where the offer comes from.",
  coverageLine: "Guard sentence about whether the offer feeds the holder.",
};

/**
 * Fields that reach the reader through a CONTROL rather than as text, each with
 * the control that receives it. A field lands here only when printing it would
 * be a fact the reader cannot act on; everything else must be visible.
 */
const FORWARDED_TO_A_CONTROL: Readonly<Record<string, string>> = {
  // `outputKind` restricts WHICH workflows may hold this job; the picker shows
  // the restriction by what it offers, and printing the raw kind slug beside it
  // would be an internal identifier on screen.
  outputKind: "workflow-picker",
};

function render(
  overrides: Partial<ScopeHolderBarProps> = {},
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung="user"
        organizationId={null}
        allowGlobal
        onRungChange={() => undefined}
        holder={{
          kind: "agent",
          agentId: "1b1f0f4e-0000-4000-8000-000000000001",
          agentVersionId: null,
          useLatest: true,
          workflowId: null,
        }}
        onHolderChange={() => undefined}
        holderName="Guard Holder Name"
        job={JOB}
        ladderLine="Guard ladder sentence."
        {...overrides}
      />,
    );
  });
  return { container, root };
}

describe("every job field the bar accepts reaches the reader", () => {
  it.each(
    Object.keys(JOB).filter((field) => !(field in FORWARDED_TO_A_CONTROL)),
  )("renders job.%s as visible text", (field) => {
    const { container, root } = render();
    const value = JOB[field as keyof typeof JOB];
    expect(container.textContent ?? "").toContain(String(value));
    act(() => root.unmount());
  });

  it("hands job.outputKind to the control that filters on it", () => {
    const { container, root } = render({
      holder: {
        kind: "workflow",
        agentId: null,
        agentVersionId: null,
        useLatest: true,
        workflowId: "2b2f0f4e-0000-4000-8000-000000000002",
      },
    });
    expect(
      container
        .querySelector('[data-testid="workflow-picker"]')
        ?.getAttribute("data-wanted-output-kind"),
    ).toBe(JOB.outputKind);
    act(() => root.unmount());
  });

  it("declares a home for EVERY field — a new one is not silently exempt", () => {
    const accounted = new Set([
      ...Object.keys(FORWARDED_TO_A_CONTROL),
      ...Object.keys(JOB).filter(
        (field) => !(field in FORWARDED_TO_A_CONTROL),
      ),
    ]);
    expect([...Object.keys(JOB)].filter((f) => !accounted.has(f))).toEqual([]);
  });
});

describe("the offer count is honest before it is read", () => {
  it("says it is still reading rather than printing a premature 0", () => {
    const { container, root } = render({
      job: { ...JOB, offeredCount: null },
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Reading what it offers");
    expect(text).not.toContain("Offers 0");
    act(() => root.unmount());
  });

  it("prints the real count once it has one", () => {
    const { container, root } = render();
    expect(container.textContent ?? "").toContain("Offers 7");
    act(() => root.unmount());
  });
});
