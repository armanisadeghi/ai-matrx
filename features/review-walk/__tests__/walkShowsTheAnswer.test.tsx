/**
 * 🚨 THE WALK WINDOW SHOWS WHAT THE AGENT ANSWERED, NOT ONLY WHAT IT RECEIVED
 * (Mandate Candidates FX-W — V1 defects D8, D9, D15).
 *
 * The fixtures are the REAL `/review/descend` payloads aidream returned for two
 * clone rows on 2026-09-30 (captured from `descend_unit`, not hand-written):
 *
 * - `live_server_run` — request 7d20b186, the live side of pair d62f052e: a
 *   server run that kept ZERO chat messages. Before FX-W the window showed only
 *   the system prompt (D8) and never the answer (D9).
 * - `candidate_stopped` — request 2e692431, the candidate side of stopped pair
 *   ee44b901: containment stopped its `note` call. Before FX-W the window filed
 *   it under "Tool results the agent worked from — note (FAILED)" (D15).
 *
 * `GroupedInputsView` is the view the walk renders for an `agent_request` unit
 * (the door every candidate pair opens). The canonical answer view and the
 * markdown pipeline are stubbed to markers so the test asserts ROUTING — the
 * answer reaches the canonical view — not their internals.
 */

import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import recorded from "./fixtures/descend-recorded-clone-2026-09-30.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: ({ value, text }: { value?: unknown; text?: string | null }) => (
    <div data-testid="answer-view" data-structured={value != null && typeof value === "object" ? "yes" : "no"}>
      {text}
    </div>
  ),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { GroupedInputsView, TurnDiagnosisView } from "../components/TurnDiagnosis";
import type { ConversationTurn } from "../turns";
import type { DescendOut } from "../types";

let container: HTMLDivElement;
let root: Root | null = null;

function render(element: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

function renderLayer(out: DescendOut) {
  render(
    <GroupedInputsView
      out={out}
      raw={false}
      expand={{ baseline: "default", overrides: {} }}
      onToggle={() => {}}
      flags={{ flagged: {}, toggle: () => {} }}
      onTrace={() => {}}
    />,
  );
}

const text = () => container.textContent ?? "";

describe("the walk window shows the answer beside the inputs", () => {
  it("D8 + D9: a run that kept no chat shows what it was sent and what it answered, labelled as rebuilt", () => {
    const out = recorded.live_server_run as unknown as DescendOut;
    renderLayer(out);

    expect(container.querySelector('[data-walk-transcript="recorded_call"]')).not.toBeNull();
    expect(text()).toContain("Rebuilt from the recorded call");
    // What it was sent — the user message, not only the system prompt.
    expect(text()).toContain("User message (as the model received it)");
    expect(text()).toContain("Tide pools");
    // What it answered — through the canonical answer view, as the structure it is.
    expect(text()).toContain("What the agent answered");
    const answer = container.querySelector('[data-testid="answer-view"]');
    expect(answer).not.toBeNull();
    expect(answer?.getAttribute("data-structured")).toBe("yes");
    expect(answer?.textContent).toContain("key_points");
  });

  it("D15: a call candidate containment stopped is a proposed call, never a failed result the agent worked from", () => {
    const out = recorded.candidate_stopped as unknown as DescendOut;
    renderLayer(out);

    expect(text()).not.toContain("Tool results the agent worked from");
    expect(text()).not.toContain("(FAILED)");
    const outcome = container.querySelector('[data-walk-tool-outcome="stopped"]');
    expect(outcome?.textContent).toBe("Stopped before it ran");
    // Opened by default, with what it proposed.
    expect(text()).toContain("Proposed arguments");
    expect(text()).toContain("V1CAND-1790806846");
  });

  it("a layer with neither chat nor a recorded call says so in one line", () => {
    const base = recorded.live_server_run as unknown as DescendOut;
    renderLayer({ ...base, inputs: [], answer: null, transcript: "none", capturable: false });
    const line = container.querySelector('[data-walk-transcript="none"]');
    expect(line?.textContent).toBe("This run kept no chat and no recorded call.");
    expect(text()).not.toContain("No recorded inputs for this unit");
  });

  it("D15 in the turn view: the stopped call the turn bundle carries no row for still reads as stopped", () => {
    const out = recorded.candidate_stopped as unknown as DescendOut;
    const stop = out.answer?.parts?.find((p) => p.kind === "tool_call");
    expect(stop?.call_id).toBeTruthy();
    // The turn as `turns.ts` folds candidate conversation 3cb55bfb: the tool
    // part joins no observability row (the stopped row has no message link).
    const turn: ConversationTurn = {
      index: 1,
      userMessageId: "b7178671-bf12-4298-b579-23db668a00b5",
      userText: "Page Title: Atacama Desert",
      userRaw: null,
      contextItems: [],
      attachments: [],
      toolsOnCall: [],
      collabNotes: [],
      assistantMessageIds: ["4c7c5341-d597-472a-90b7-e512fe09a2f0"],
      rootAssistantMessageId: "4c7c5341-d597-472a-90b7-e512fe09a2f0",
      parts: [{ kind: "tool", seq: 0, callId: stop!.call_id!, name: "note", args: null, row: null }],
      hasError: false,
    };
    render(
      <TurnDiagnosisView
        turn={turn}
        out={out}
        raw={false}
        expand={{ baseline: "default", overrides: {} }}
        onToggle={() => {}}
        flags={{ flagged: {}, toggle: () => {} }}
        onTrace={() => {}}
      />,
    );
    expect(text()).toContain("Stopped before it ran");
    expect(text()).toContain("Proposed arguments");
    expect(text()).toContain("V1CAND-1790806846");
    expect(text()).not.toContain("No recorded result.");
  });
});
