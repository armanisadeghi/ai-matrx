/**
 * AN AGENT NEVER CHANGES THE PERSON'S TEXT WITHOUT ASKING — as a guard.
 *
 * The break (live, 2026-10-05, /notes → "Summarize Content"): the summary run
 * called `widget_text_patch` and the note body was rewritten in place. No
 * approval was shown; a summarize shortcut's job is to show a summary.
 *
 * The rule: a widget_* write obeys the same `ask` policy as
 * `apply_surface_write` — the inline approval card first, the write only on
 * Approve. A handle that stages writes for its own review declares
 * `applyPolicy: "auto"`.
 *
 * SUT: the real `dispatchWidgetAction`. Replaced: the approval card (its
 * decision is the input), the agent-name lookup, and the tool-result POST.
 */

import type { PendingToolResult } from "../../../../api/submit-tool-results";
import type { ApprovalDecision } from "../../../../ui-first-tools/redux/request-approval";

const mockSubmitted: PendingToolResult[] = [];
const mockAsked: unknown[] = [];
let mockDecision: ApprovalDecision = { kind: "rejected" };

jest.mock("../../../../api/submit-tool-results", () => ({
  submitToolResult: (pending: PendingToolResult) => {
    mockSubmitted.push(pending);
    return () => undefined;
  },
}));
jest.mock("../../../../ui-first-tools/redux/request-approval", () => ({
  requestInlineApproval: async (input: { change: unknown }) => {
    mockAsked.push(input.change);
    return mockDecision;
  },
}));
jest.mock("../../../../../surfaces/hooks/useAgentNames", () => ({
  resolveAgentName: async () => "Summarize Content",
}));

import { callbackManager } from "@ai-matrx/chat/utils/callbackManager";
import { dispatchWidgetAction } from "../../thunks/dispatch-widget-action.thunk";
import type { ChatRootState } from "../../../../../store/root-state";
import type { WidgetHandle } from "../../../../types/widget-handle.types";

const CONV = "conv-notes";
const NOTE = "Ingrid Strand — crown seat prep. Numb lower left, seat crown #19.";

function stateFor(widgetHandleId: string): ChatRootState {
  return {
    agentDefinition: { agents: {} },
    conversations: {
      byConversationId: { [CONV]: { agentId: "agent-summarize" } },
    },
    instanceUIState: { byConversationId: { [CONV]: { widgetHandleId } } },
  } as unknown as ChatRootState;
}

async function runPatch(handleId: string) {
  const thunk = dispatchWidgetAction({
    conversationId: CONV,
    requestId: "req-1",
    callId: "call-1",
    toolName: "widget_text_patch",
    args: { search_text: NOTE, replacement_text: "Summary: crown seat." },
  });
  return thunk((a: unknown) => a, () => stateFor(handleId), undefined);
}

describe("a widget write asks the person first", () => {
  let note: string;
  let handleId: string;
  const register = (extra: Partial<WidgetHandle> = {}) =>
    callbackManager.registerWidgetHandle({
      readText: () => note,
      onTextPatch: ({ search_text, replacement_text }) => {
        note = note.replace(search_text, replacement_text);
      },
      ...extra,
    } satisfies WidgetHandle);

  beforeEach(() => {
    mockSubmitted.length = 0;
    mockAsked.length = 0;
    note = NOTE;
  });
  afterEach(() => callbackManager.unregister(handleId));

  it("shows the approval card and leaves the note untouched when the person keeps it", async () => {
    handleId = register();
    mockDecision = { kind: "rejected" };
    await runPatch(handleId);
    expect(mockAsked).toHaveLength(1);
    expect(mockAsked[0]).toMatchObject({
      actor: "Summarize Content",
      fields: [{ before: NOTE, after: "Summary: crown seat." }],
    });
    expect(note).toBe(NOTE);
    expect(mockSubmitted).toHaveLength(1);
    expect(mockSubmitted[0]).toMatchObject({
      is_error: false,
      output: { status: "declined_by_person", declined: true },
    });
    expect((mockSubmitted[0].output as Record<string, unknown>).ok).toBeUndefined();
  });

  it("applies the write only after Approve", async () => {
    handleId = register();
    mockDecision = { kind: "approved", remember: false };
    await runPatch(handleId);
    expect(mockAsked).toHaveLength(1);
    expect(note).toBe("Summary: crown seat.");
    expect(mockSubmitted[0]).toMatchObject({
      is_error: false,
      output: { ok: true, applied: "widget_text_patch" },
    });
  });

  it("a handle that stages its own review (applyPolicy auto) is not asked", async () => {
    handleId = register({ applyPolicy: "auto" });
    await runPatch(handleId);
    expect(mockAsked).toHaveLength(0);
    expect(note).toBe("Summary: crown seat.");
  });
});
