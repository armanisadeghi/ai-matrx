/**
 * GUARD: a tool card on screen when a turn's answer finishes is still on
 * screen after it finishes — with the same entry, events included.
 *
 * The defect (verifier 2026-09-26, round 2, "Defect 1"): a clinic manager asks
 * the assistant to patch step 4 of her intake checklist. The `data` tool card
 * (with its before/after diff) appears live; the instant the answer completes
 * the WHOLE card disappears, and only a page reload brings it back. Same for
 * memory and picklist cards, in /chat, the side drawer and the Chat window.
 *
 * Why: the server persists one assistant row per iteration — the tool call in
 * iteration 1's row, the answer text in iteration 2's row — and every row
 * carries the same live `_streamRequestId`. While streaming, the turn group
 * collapses them to ONE stream-anchored member (the last row) because the
 * stream render shows the whole request. Once settled, that member renders
 * from ITS OWN committed record ("the final screen is the reload",
 * `renderSettledFromRecord`) — which holds only the answer text. The tool
 * call's row had been collapsed away, so its card vanished. A reload has no
 * `_streamRequestId`, renders every row, and the card is back.
 *
 * The seam: the REAL `processStream` thunk drives a real NDJSON stream into the
 * real `activeRequests` / `messages` / `observability` reducers; the real
 * display grouping, the real turn-group member decision
 * (`rendersFromPersistedRows` + `membersForRender`, exactly what
 * AssistantTurnGroup calls) and the real content-source decision
 * (`renderSettledFromRecord`, exactly what EnhancedChatMarkdown calls) pick
 * what each rendered member shows; the real selectors and the real
 * persisted-entry builder produce the tool entries. Nothing under test is
 * stubbed.
 */
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  createRequest,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { selectUnifiedSlotRange } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import messagesReducer from "@/features/agents/redux/execution-system/messages/messages.slice";
import observabilityReducer from "@/features/agents/redux/execution-system/observability/observability.slice";
import { selectMessageInterleavedContent } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { processStream } from "@/features/agents/redux/execution-system/thunks/process-stream";
import {
  buildDisplayEntries,
  groupDisplayEntries,
} from "../display-groups";
import {
  membersForRender,
  rendersFromPersistedRows,
} from "../assistant/collapse-by-request-id";
import { renderSettledFromRecord } from "@/components/mardown-display/chat-markdown/settle-stream-blocks";
import { persistedToolEntry } from "@/features/tool-call-visualization/utils/cxToolCallToLifecycleEntry";
import { readSurfaceWrite } from "@/features/tool-call-visualization/surface-write/readSurfaceWrite";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;
const encoder = new TextEncoder();

const CONV = "2c1f0a7e-5b8d-4c3e-9a61-0d4e8f7b3a21";
const REQ = "req_intake_checklist_patch";
const CALL = "toolu_intake_step4";
const TOOL_ROW = "7f3e2a10-8c4b-4d9e-b1a2-5e6f7a8b9c0d";
const ITER1_ROW = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
const ITER2_ROW = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";

const BEFORE = [
  "# New patient intake — front desk",
  "1. Confirm photo ID and insurance card",
  "2. Scan both cards into the chart",
  "3. Hand over the health history form",
  "4. Take blood pressure",
  "5. Room the patient",
].join("\n");
const AFTER = BEFORE.replace(
  "4. Take blood pressure",
  "4. Take blood pressure and record allergies",
);

function steppedResponse(events: unknown[]) {
  let index = 0;
  let release: (() => void) | undefined;
  let notify!: () => void;
  let ready = new Promise<void>((resolve) => {
    notify = resolve;
  });
  return {
    response: {
      body: {
        getReader: () => ({
          read: async () => {
            if (index >= events.length) {
              notify();
              return { done: true };
            }
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            notify();
            await gate;
            return {
              done: false,
              value: encoder.encode(JSON.stringify(events[index++]) + "\n"),
            };
          },
          releaseLock() {},
        }),
      },
      headers: new Headers(),
    } as unknown as Response,
    async advance() {
      await ready;
      const next = release;
      if (!next) throw new Error("stream reader did not stop at its checkpoint");
      ready = new Promise<void>((resolve) => {
        notify = resolve;
      });
      release = undefined;
      next();
      await ready;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  };
}

const assistantRow = (id: string, position: number) => ({
  event: "record_reserved",
  data: {
    db_project: "main",
    table: "message",
    record_id: id,
    parent_refs: { conversation_id: CONV },
    metadata: { role: "assistant", position },
  },
});

const toolEvent = (event: string, data: Record<string, unknown> = {}) => ({
  event: "tool_event",
  data: { event, call_id: CALL, tool_name: "data", data },
});

// One realistic turn: iteration 1 patches the note (tool call), iteration 2
// writes the answer. The server reserves one assistant row per iteration.
const TURN_EVENTS: unknown[] = [
  assistantRow(ITER1_ROW, 1),
  {
    event: "record_reserved",
    data: {
      db_project: "main",
      table: "tool_call",
      record_id: TOOL_ROW,
      parent_refs: {
        conversation_id: CONV,
        user_request_id: "ur_intake_1",
        call_id: CALL,
      },
      metadata: { tool_name: "data", call_id: CALL, iteration: 1 },
    },
  },
  toolEvent("tool_started", {
    arguments: {
      action: "patch",
      target: "note",
      old_text: "4. Take blood pressure",
      new_text: "4. Take blood pressure and record allergies",
    },
  }),
  toolEvent("tool_step", {
    step: "surface_write",
    metadata: {
      target_type: "note",
      target_id: "note_intake_checklist",
      target_label: "New patient intake — front desk",
      mode: "patch",
      content_format: "markdown",
      before: BEFORE,
      after: AFTER,
      before_chars: BEFORE.length,
      after_chars: AFTER.length,
      truncated: false,
      edits: 1,
    },
  }),
  toolEvent("tool_completed", {
    result: { ok: true, note_id: "note_intake_checklist", edits: 1 },
  }),
  assistantRow(ITER2_ROW, 3),
  {
    event: "chunk",
    data: {
      text: "Step 4 now reads “Take blood pressure and record allergies.” Nothing else on the checklist changed.",
    },
  },
  { event: "end", data: {} },
];

function harness(events: unknown[]) {
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId: CONV }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  let observability = observabilityReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      observability,
      conversations: {
        byConversationId: { [CONV]: { status: "streaming", agentId: null } },
      },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown) => {
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    observability = observabilityReducer(observability, action as never);
    return action;
  };
  const stream = steppedResponse(events);
  return {
    getState,
    stream,
    done: processStream({
      requestId: REQ,
      conversationId: CONV,
      response: stream.response,
      submitAt: 0,
      conversationIdAt: null,
      dispatch,
      getState,
      abortController: new AbortController(),
    }),
  };
}

interface CardOnScreen {
  callId: string;
  toolName: string;
  source: "live stream" | "committed record";
  entry: ToolLifecycleEntry;
}

/**
 * Every tool card the transcript renders, following the exact decisions the
 * components make: display groups → turn-group members → per-member content
 * source → tool entries.
 */
function toolCardsOnScreen(state: RootState, streamActive: boolean): CardOnScreen[] {
  const conv = state.messages.byConversationId[CONV];
  const groups = groupDisplayEntries(
    buildDisplayEntries({
      messages: conv.orderedIds.map((id) => conv.byId[id]),
      isActive: streamActive,
      latestRequestId: REQ,
      isErrorPhase: false,
    }),
  );
  const cards: CardOnScreen[] = [];
  for (const group of groups) {
    if (group.kind !== "assistant") continue;
    const members = membersForRender(
      group.members,
      rendersFromPersistedRows(group.members, conv.byId),
    );
    for (const m of members) {
      const segments = m.messageId
        ? selectMessageInterleavedContent(CONV, m.messageId)(state)
        : [];
      const fromRecord =
        !m.requestId ||
        renderSettledFromRecord({
          isStreamActive: m.isStreamActive,
          messageId: m.messageId,
          recordSegmentCount: segments.length,
        });
      if (fromRecord) {
        for (const s of segments) {
          if (s.type !== "db_tool") continue;
          const entry = persistedToolEntry(s);
          cards.push({
            callId: s.callId,
            toolName: entry.toolName,
            source: "committed record",
            entry,
          });
        }
      } else if (m.requestId) {
        const lifecycle =
          state.activeRequests.byRequestId[m.requestId]?.toolLifecycle ?? {};
        for (const slot of selectUnifiedSlotRange(
          m.requestId,
          m.streamSlotStart ?? 0,
          m.streamSlotEnd,
        )(state)) {
          if (slot.kind !== "tool") continue;
          const entry = lifecycle[slot.callId];
          if (!entry) continue;
          cards.push({
            callId: slot.callId,
            toolName: entry.toolName,
            source: "live stream",
            entry,
          });
        }
      }
    }
  }
  return cards;
}

test("the intake-checklist patch card survives the answer completing — same call, same diff", async () => {
  const h = harness(TURN_EVENTS);

  // Everything but `end`: the answer is still streaming.
  for (let i = 0; i < TURN_EVENTS.length - 1; i++) await h.stream.advance();
  const atStreamEnd = toolCardsOnScreen(h.getState(), true);
  expect(atStreamEnd.map((c) => `${c.toolName}:${c.callId}`)).toEqual([
    `data:${CALL}`,
  ]);
  expect(readSurfaceWrite(atStreamEnd[0].entry)?.after).toBe(AFTER);

  // `end` lands: the turn commits and settles.
  await h.stream.advance();
  await h.done;
  const state = h.getState();
  const rows = state.messages.byConversationId[CONV].byId;
  // Precondition — the realistic shape: the tool call lives in iteration 1's
  // row, the answer text in iteration 2's row, both anchored to one request.
  expect(rows[ITER1_ROW]._streamRequestId).toBe(REQ);
  expect(rows[ITER2_ROW]._streamRequestId).toBe(REQ);

  const afterCompletion = toolCardsOnScreen(state, false);
  expect(afterCompletion.map((c) => `${c.toolName}:${c.callId}`)).toEqual([
    `data:${CALL}`,
  ]);
  // Same entry: the before/after the person saw live is still there.
  const receipt = readSurfaceWrite(afterCompletion[0].entry);
  expect(receipt?.before).toBe(BEFORE);
  expect(receipt?.after).toBe(AFTER);
  expect(afterCompletion[0].entry.status).toBe("completed");
});

test("a reload of the same turn shows the same card (the reference the settled screen must equal)", async () => {
  const h = harness(TURN_EVENTS);
  for (let i = 0; i < TURN_EVENTS.length; i++) await h.stream.advance();
  await h.done;
  const settled = h.getState();
  // A reload carries no live request anchor on any row.
  const conv = settled.messages.byConversationId[CONV];
  const reloadedById = Object.fromEntries(
    Object.entries(conv.byId).map(([id, row]) => [
      id,
      { ...row, _streamRequestId: undefined },
    ]),
  );
  const reloaded = {
    ...settled,
    activeRequests: { ...settled.activeRequests, byRequestId: {} },
    messages: {
      ...settled.messages,
      byConversationId: {
        ...settled.messages.byConversationId,
        [CONV]: { ...conv, byId: reloadedById },
      },
    },
  } as unknown as RootState;
  expect(
    toolCardsOnScreen(reloaded, false).map((c) => `${c.toolName}:${c.callId}`),
  ).toEqual(toolCardsOnScreen(settled, false).map((c) => `${c.toolName}:${c.callId}`));
});
