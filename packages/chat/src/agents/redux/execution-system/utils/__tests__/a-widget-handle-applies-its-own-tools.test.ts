/**
 * THE AGENT EDITS THE WIDGET I'M LOOKING AT — as a guard.
 *
 * The break (live, 2026-10-03, /notes → "Summarize Content"): every editor
 * with a widget handle sent its `widget_text_*` names with `delegate: true`,
 * but the server delegates only by executor binding, so the calls ran (and
 * were then withheld) on the server, where the widget's text does not exist.
 * "The agent edits the widget I'm looking at" was dead on every surface.
 *
 * The widget is client state, so the CLIENT applies these tools. Two halves:
 *   1. The request declares the `widget-handle` capability naming the tools
 *      its handle can apply — the server turns on the client executor for
 *      exactly those requests and delegates them back.
 *   2. A delegated `widget_text_replace` lands in the handle and the result
 *      posts back ok.
 *
 * SUT: the real `buildToolInjection` with the real capability providers
 * (`register-all`), and the real `dispatchWidgetAction`. Replaced: only the
 * surface registry, the DB client and the tool-result POST.
 */

import type { PendingToolResult } from "../../../../api/submit-tool-results";

const mockSubmitted: PendingToolResult[] = [];

jest.mock("../../../../../surfaces/runtime/registry", () => ({
  getDeclaringSurface: () => null,
  getManifest: () => undefined,
  getSurfaceAncestry: () => [],
}));
jest.mock("../../../../../host/db", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
}));
jest.mock("../../../../api/submit-tool-results", () => ({
  submitToolResult: (pending: PendingToolResult) => {
    mockSubmitted.push(pending);
    return () => undefined;
  },
}));

import { callbackManager } from "@ai-matrx/chat/utils/callbackManager";
import { buildToolInjection } from "../build-tool-injection";
import { dispatchWidgetAction } from "../../thunks/dispatch-widget-action.thunk";
import type { ChatRootState } from "../../../../../store/root-state";
import type { WidgetHandle } from "../../../../types/widget-handle.types";

const CONV = "conv-notes";

function makeState(widgetHandleId: string | null): ChatRootState {
  const agentId = "agent-summarize";
  return {
    agentDefinition: {
      agents: {
        [agentId]: {
          id: agentId,
          name: "Summarize",
          tools: [],
          customTools: [],
          mcpServers: [],
          _loadedFields: { name: true, modelId: true, tools: true },
        },
      },
    },
    conversations: {
      byConversationId: {
        [CONV]: { agentId, mandateKey: null, surfaceName: "matrx-user/notes" },
      },
    },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: { byConversationId: { [CONV]: { widgetHandleId } } },
    editorState: { byConversationId: {} },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as ChatRootState;
}

describe("a widget handle applies its own tools", () => {
  let note: string;
  let handleId: string;

  beforeEach(() => {
    mockSubmitted.length = 0;
    note = "Meeting notes: draft";
    handleId = callbackManager.registerWidgetHandle({
      onTextReplace: ({ text }) => {
        note = text;
      },
      onTextAppend: ({ text }) => {
        note = `${note}${text}`;
      },
    } satisfies WidgetHandle);
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    callbackManager.unregister(handleId);
    jest.restoreAllMocks();
  });

  it("declares the widget-handle capability naming exactly the tools the handle applies", async () => {
    const result = await buildToolInjection(makeState(handleId), CONV, {
      mode: "additive",
    });
    expect(result.client?.capabilities).toContain("widget-handle");
    expect(result.client?.state?.["widget-handle"]).toEqual({
      tools: ["widget_text_replace", "widget_text_append"],
    });
    const names = (result.tools ?? []).map((t) =>
      t.kind === "agent" ? t.agent_id : t.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(["widget_text_replace", "widget_text_append"]),
    );
  });

  it("declares nothing when the conversation holds no handle", async () => {
    const result = await buildToolInjection(makeState(null), CONV, {
      mode: "additive",
    });
    expect(result.client?.capabilities ?? []).not.toContain("widget-handle");
  });

  it("a delegated widget_text_replace edits the handle and posts ok", async () => {
    const state = makeState(handleId);
    const dispatched: unknown[] = [];
    const thunk = dispatchWidgetAction({
      conversationId: CONV,
      requestId: "req-1",
      callId: "call-1",
      toolName: "widget_text_replace",
      args: { text: "Meeting notes: final" },
    });
    const outcome = await thunk(
      (action: unknown) => {
        dispatched.push(action);
        return action;
      },
      () => state,
      undefined,
    );
    expect(outcome.payload).toEqual({ ok: true, applied: "widget_text_replace" });
    expect(note).toBe("Meeting notes: final");
    expect(mockSubmitted).toHaveLength(1);
    expect(mockSubmitted[0]).toMatchObject({
      call_id: "call-1",
      tool_name: "widget_text_replace",
      is_error: false,
    });
  });
});
