/**
 * EXPECTED vs ACTUAL is never silent (common-docs context-delivery RULES.md §6).
 *
 * - the screen's rows and the server's receipt agree → checked, no mismatch;
 * - they disagree → a mismatch on the row AND a captured `context_truth_mismatch`;
 * - a receipt for a request the screen recorded no rows for → stored as
 *   UNCHECKED and captured as `context_truth_unchecked`, never counted a pass.
 */

import { resolveContextRow } from "@ai-matrx/agents/context";
import type { ContextReceiptData } from "@/types/python-generated/stream-events";
import type { RootState } from "@/lib/redux/store";

const captured: Array<{ code?: string }> = [];
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: { code?: string }) => {
    captured.push(input);
    return "id";
  },
}));
jest.mock("@/lib/toast", () => ({ toast: { warning: jest.fn(), error: jest.fn() } }));

import { recordContextReceipt } from "../receipt-check";

const row = resolveContextRow(
  {
    key: "note_bundle",
    label: "Note and workspace",
    surfaceKey: "matrx-user/notes",
    origin: "page",
    value: "x".repeat(900),
    layers: { surface: { declared: true, auto_context: true, max_inline_chars: 12000 } },
  },
  {},
);

function receipt(maxInline: number, delivery: "inline" | "on_request"): ContextReceiptData {
  return {
    type: "context_receipt",
    version: 1,
    surface: "matrx-user/notes",
    cap: 50000,
    model_reads_context: true,
    rules_error: null,
    rows: [
      {
        key: "note_bundle",
        label: "Note and workspace",
        surface_key: "matrx-user/notes",
        origin: "client",
        chars: 900,
        include: true,
        max_inline_chars: maxInline,
        delivery,
        decided_by: { include: "default", max_inline_chars: "page" },
        user_rule: null,
        clamped: false,
        client_sent_excluded: false,
        blocked_by: null,
      },
    ],
  };
}

function run(expectedRequestId: string | null, data: ContextReceiptData) {
  const actions: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const state = {
    instanceContext: {
      expectedByConversationId: expectedRequestId
        ? { c1: { requestId: expectedRequestId, rows: [{ ...row, value: undefined }] } }
        : {},
    },
    userAuth: { isAdmin: false, adminLaneOpen: false },
  } as unknown as RootState;
  recordContextReceipt(
    ((a: { type: string; payload: Record<string, unknown> }) => actions.push(a)) as never,
    () => state,
    { conversationId: "c1", requestId: "r1", data },
  );
  return actions.find((a) => a.type.endsWith("setContextReceipt"))!.payload;
}

beforeEach(() => {
  captured.length = 0;
});

it("agreement is checked and clean", () => {
  const entry = run("r1", receipt(12000, "inline"));
  expect(entry.checked).toBe(true);
  expect(entry.mismatches).toEqual([]);
  expect(captured).toEqual([]);
});

it("a disagreement is marked on the row and captured", () => {
  const entry = run("r1", receipt(200, "on_request"));
  expect(entry.checked).toBe(true);
  expect((entry.mismatches as Array<{ field: string }>).map((m) => m.field)).toEqual(
    expect.arrayContaining(["max_inline_chars", "delivery"]),
  );
  expect(captured.map((c) => c.code)).toContain("context_truth_mismatch");
});

it("a receipt for a request with no recorded rows is UNCHECKED, never a pass", () => {
  const entry = run("r0", receipt(200, "on_request"));
  expect(entry.checked).toBe(false);
  expect(entry.mismatches).toEqual([]);
  expect(captured.map((c) => c.code)).toEqual(["context_truth_unchecked"]);
});
