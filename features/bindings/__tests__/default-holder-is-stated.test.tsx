/**
 * THE JOB'S OWN DEFAULT IS STATED, NOT JUST DESCRIBED.
 *
 * 🚨 THE DEFECT (one-resolution FIX-R6/F3, fresh Sonnet walk of production
 * v0.4.1722). A walker set an org-homed job's bottom-rung holder, watched
 * "Fulfilled by" name the new holder, hard-reloaded, and read — verbatim —
 *
 *   "No holder yet — pick an agent or a workflow to start mapping, or come
 *    back when the intelligence exists."
 *
 * inside the HOLDER cell, directly beside a block headed "THE JOB'S OWN
 * DEFAULT", and reported the save as lost. It was not lost. Two sentences were
 * lying by omission, and both are fixed here as one class:
 *
 *   1. the empty-holder sentence had NO SUBJECT, so a cell answering about the
 *      USER rung read as "this job has no holder at all";
 *   2. the "job's own default" block said what that rung COVERS and offered a
 *      button to go set it, and never said WHO HOLDS IT TODAY — so the one
 *      thing the reader was looking for was on no screen they were standing on.
 *
 * RED against the pre-fix commit: `defaultHolderNow` does not exist, the
 * default block prints no holder, and the empty-holder sentence names no rung.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock(
  "@/features/agents/components/agent-listings/AgentListDropdown",
  () => ({ AgentListDropdown: () => <div data-testid="agent-picker" /> }),
);
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
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
  EntityRef: ({ name }: { name?: string }) => <span>{name}</span>,
}));

import { ScopeHolderBar, type WorkspaceRung } from "../ScopeHolderBar";
import { defaultHolderRungOffer } from "../default-holder-rung";

const OFFER = defaultHolderRungOffer({
  homeOrganizationId: "2643e470-b275-47f3-95f3-ae275ad3ca47",
  homeOrganizationName: "Write Target Sandbox",
  homeOrganizationRole: "owner",
  isSuperAdmin: false,
});

const EMPTY_HOLDER = {
  kind: "agent" as const,
  agentId: null,
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
};

let container: HTMLDivElement;
let root: Root;

function render(
  rung: WorkspaceRung,
  defaultHolderNow: { set: boolean; name: string | null } | null,
): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung={rung}
        organizationId={null}
        allowGlobal={false}
        defaultHolderOffer={OFFER}
        defaultHolderNow={defaultHolderNow}
        onRungChange={() => undefined}
        holder={EMPTY_HOLDER}
        onHolderChange={() => undefined}
        job={{
          mandateKey: "zzz.walk_r6",
          label: "ZZZ WALKR6",
          outputKind: "",
          offeredCount: 0,
          offerSourceLine: "",
          coverageLine: null,
        }}
        ladderLine=""
      />,
    );
  });
  return container.textContent ?? "";
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("standing on a rung ABOVE the job's own default", () => {
  it("states who holds the bottom rung today", () => {
    const text = render("user", {
      set: true,
      name: "Research → Slides Generator",
    });
    expect(text).toContain("The job's own default");
    expect(text).toContain("Held by Research → Slides Generator today.");
  });

  it("says nobody holds it when nobody does — and does not call that unread", () => {
    const text = render("user", { set: false, name: null });
    expect(text).toContain("Nobody holds it");
  });

  it("says it is still reading rather than inventing an answer", () => {
    const text = render("user", null);
    expect(text).toContain("Reading who holds it…");
  });

  it("never prints a holder id in place of a name", () => {
    const text = render("user", { set: true, name: null });
    expect(text).toMatch(/name could not be read/i);
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});

describe("the empty HOLDER cell names the rung it is empty at", () => {
  it("at the user rung, and says the ladder below still answers", () => {
    const text = render("user", { set: true, name: "Slides Generator" });
    expect(text).toContain("Nothing is set at your own answer yet");
    expect(text).toContain("a rung below it names is still what runs");
    // The subjectless sentence the walker read is gone for good.
    expect(text).not.toContain("No holder yet — pick an agent");
  });

  it("at the bottom rung, where nothing below can answer", () => {
    const text = render("system", { set: false, name: null });
    expect(text).toContain("Nothing is set at Default for Write Target Sandbox yet");
    expect(text).toContain("the job has no holder of its own at all");
  });
});
