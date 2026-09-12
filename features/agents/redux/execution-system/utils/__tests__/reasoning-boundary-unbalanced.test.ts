/**
 * REGRESSION GUARD: an UNBALANCED provider reasoning wrapper is never silent.
 *
 * Anthropic/OpenAI/Gemini thinking reaches this client as inline
 * `\n<reasoning>\n … \n</reasoning>\n` inside the ordinary text channel (aidream
 * `providers/anthropic/anthropic_api.py`), so the open/close pair is the ONLY
 * thing separating the model's chain-of-thought from its answer. On 2026-09-12
 * a shared-state race in the provider parser sent that pair out unbalanced —
 * the wrapper state lived on a process-wide client instance, so two concurrent
 * turns shared one flag (root cause fixed in aidream
 * `providers/reasoning_stream_state.py`, guarded by
 * `packages/matrx-ai/tests/test_provider_reasoning_wrapper_concurrency.py`).
 *
 * Both halves landed on real users, in three live turns
 * (`docs/handoffs/canonical-stream-and-surface-writeback.md` § "Cross-cutting
 * defect"):
 *
 *   1. CLOSE WITHOUT OPEN — a literal `</reasoning>` printed as message
 *      content above the tool cards, and the thinking around it read as the
 *      answer. The one guard watching this boundary matched OPENING tags only,
 *      so nothing was captured at all.
 *   2. OPEN WITHOUT CLOSE — the stream ended inside the region, so the whole
 *      visible answer sat in a thinking block and the assistant message
 *      rendered empty behind a collapsed "Thought process".
 *
 * The client cannot repair either (only the provider knows where thinking
 * ended), but it must never hide them: scaffolding stays out of the reader's
 * content, and the defect is captured with its remedy.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
} from "../../active-requests/active-requests.slice";
import { StreamBlockAccumulator } from "../stream-block-accumulator";
import type { ActiveRequest } from "@/features/agents/types/request.types";

const captured: Array<{ source: string; message: string }> = [];

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: { source: string; message: string }) => {
    captured.push({ source: input.source, message: input.message });
  },
}));

const REQ = "req_reasoning_boundary";
const CONV = "conv_reasoning_boundary";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

/** Drive the accumulator with the wire chunks of one text run. */
function run(chunks: string[]): {
  blocks: Array<{ type: string; content: string }>;
} {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (p) => upsertRenderBlock(p));
  for (const chunk of chunks) {
    dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }) as never);
    dispatch(appendChunk({ requestId: REQ, content: chunk }) as never);
    acc.ingest(chunk, dispatch);
  }
  dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }) as never);
  acc.finalize(dispatch);

  const request = (
    store.getState() as {
      activeRequests: { byRequestId: Record<string, ActiveRequest> };
    }
  ).activeRequests.byRequestId[REQ];
  return {
    blocks: request.renderBlockOrder.map((id) => {
      const block = request.renderBlocks[id] as { type: string; content?: unknown };
      return { type: block.type, content: String(block.content ?? "") };
    }),
  };
}

beforeEach(() => {
  captured.length = 0;
});

test("a balanced wrapper still separates thinking from the answer", () => {
  // The exact chunk shape captured off the live wire (aidream emits the tags
  // on their own lines, and the close rides the last thinking chunk).
  const { blocks } = run([
    "\n<reasoning>\n",
    "17*23 is 391, but I should double-check",
    " that.\n\n\n</reasoning>\n",
    "**17 × 23 = 391.** The arithmetic checks out.\n",
  ]);

  const reasoning = blocks.filter((b) => b.type === "reasoning");
  const answer = blocks.filter((b) => b.type === "text" && b.content.trim());
  expect(reasoning).toHaveLength(1);
  expect(answer.map((b) => b.content).join("")).toContain("17 × 23 = 391");
  expect(answer.map((b) => b.content).join("")).not.toContain("reasoning>");
  expect(captured).toEqual([]);
});

test("CLOSE WITHOUT OPEN: the tag never reaches the reader, and it screams", () => {
  const { blocks } = run([
    "Let me look at the task first.\n",
    "\n</reasoning>\n",
    "I can't change the assignee — it is not a declared write target.\n",
  ]);

  const visible = blocks.map((b) => b.content).join("");
  expect(visible).not.toContain("</reasoning>");
  // The answer itself survives — stripping scaffolding never eats content.
  expect(visible).toContain("not a declared write target");
  expect(captured).toHaveLength(1);
  expect(captured[0].source).toBe("reasoning-leak");
  expect(captured[0].message).toContain("NO open reasoning region");
});

test("OPEN WITHOUT CLOSE: the swallowed answer is reported, not hidden", () => {
  const { blocks } = run([
    "\n<reasoning>\n",
    "The assignee field is not declared on this surface.\n",
    "I can't change the assignee — it is not a declared write target.\n",
  ]);

  // Today's rendering: it is ALL inside the thinking region (which is exactly
  // the empty-looking message the user saw) — so the capture is the only thing
  // standing between the reader and silence.
  expect(blocks.every((b) => b.type === "reasoning" || !b.content.trim())).toBe(
    true,
  );
  expect(captured).toHaveLength(1);
  expect(captured[0].source).toBe("reasoning-leak");
  expect(captured[0].message).toContain("ended INSIDE");
  expect(captured[0].message).toContain("reasoning_stream_state.py");
});

test("prose that merely mentions reasoning is untouched", () => {
  const { blocks } = run([
    "The reasoning here is simple: closing tags like `</reasoning` in prose are fine.\n",
  ]);
  expect(blocks.map((b) => b.content).join("")).toContain("The reasoning here");
  expect(captured).toEqual([]);
});
