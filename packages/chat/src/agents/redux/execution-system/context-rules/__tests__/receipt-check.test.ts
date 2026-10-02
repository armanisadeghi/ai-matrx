/**
 * EXPECTED vs ACTUAL is never silent (common-docs context-delivery RULES.md §6).
 *
 * - the screen's rows and the server's receipt agree → checked, no mismatch;
 * - they disagree → a mismatch on the row AND a captured `context_truth_mismatch`;
 * - a receipt for a request the screen recorded no rows for → stored as
 *   UNCHECKED and captured as `context_truth_unchecked`, never counted a pass.
 */

import { resolveContextRow } from "@ai-matrx/agents/context";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import type { RootState } from "@host/lib/redux/store";

const captured: Array<{ code?: string; message?: string; details?: string }> = [];
jest.mock("@host/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: { code?: string; message?: string; details?: string }) => {
    captured.push(input);
    return "id";
  },
}));
jest.mock("@host/lib/toast", () => ({ toast: { warning: jest.fn(), error: jest.fn() } }));

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

function run(
  expectedRequestId: string | null,
  data: ContextReceiptData,
  extraRows: Array<Record<string, unknown>> = [],
) {
  const actions: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const state = {
    instanceContext: {
      expectedByConversationId: expectedRequestId
        ? { c1: { requestId: expectedRequestId, rows: [{ ...row, value: undefined }, ...extraRows] } }
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

// Break this catches: a value the server's post-render safety check stripped
// (blocked_by "self_check") coerced to null and reported as the screen lying.
it("a value the server's safety check removed keeps its reason and is worded as such", () => {
  const data = receipt(12000, "inline");
  data.rows![0] = { ...data.rows![0], delivery: "off", blocked_by: "self_check" };
  const entry = run("r1", data);
  const stored = (entry.receipt as ContextReceiptData).rows![0];
  expect(stored.blocked_by).toBe("self_check");
  expect(entry.mismatches).toEqual([expect.objectContaining({ key: "note_bundle", reason: "self_check" })]);
  const mismatch = captured.find((c) => c.code === "context_truth_mismatch");
  expect(mismatch?.message).toBe("Removed by the server's safety check (1)");
  expect(mismatch?.details).toBe("note_bundle: removed by the server's safety check");
});

// verify-7 #4, then verify-9: a receipt with no row for an envelope the screen sent means the
// server lost it (Add more cards: the model answered "no dialog is open"). It is never skipped.
it("an envelope the receipt leaves out is a missing value, never skipped", () => {
  const platformRow = (key: string, label: string) => ({
    ...resolveContextRow(
      {
        key,
        label,
        surfaceKey: "matrx-user/notes",
        origin: "page",
        value: [{ title: "Add more cards", kind: "dialog", fields: [] }],
        layers: { surface: { declared: true, auto_context: true, max_inline_chars: 10 } },
      },
      {},
    ),
    value: undefined,
  });
  const entry = run("r1", receipt(12000, "inline"), [
    platformRow("window_forms", "Open windows"),
    platformRow("surface_chain", "Open screens"),
  ]);
  expect(entry.checked).toBe(true);
  expect(entry.mismatches).toEqual([
    expect.objectContaining({ key: "window_forms", field: "missing" }),
    expect.objectContaining({ key: "surface_chain", field: "missing" }),
  ]);
});

// RULES.md §5 `consumed_as`: a server that keeps a row for the envelope it expanded is held to
// it like any key — the envelope is compared, never skipped, once the receipt accounts for it.
it("an expanded envelope the receipt accounts for is compared like any key", () => {
  const windows = {
    ...resolveContextRow(
      {
        key: "window_forms",
        label: "Open windows",
        surfaceKey: "matrx-user/notes",
        origin: "page",
        value: [{ title: "Add more cards", kind: "dialog", fields: [] }],
      },
      {},
    ),
    value: undefined,
  };
  const base = receipt(12000, "inline");
  const envelopeRow = (include: boolean) => ({
    ...base.rows![0],
    key: "window_forms",
    label: "Open windows",
    chars: null,
    include,
    max_inline_chars: windows.max_inline_chars,
    delivery: include ? ("on_request" as const) : ("off" as const),
    decided_by: { include: "default" as const, max_inline_chars: "default" as const },
    consumed_as: "expanded" as const,
    consumed_into: ["window::Add more cards"],
  });
  const agreeing = run("r1", { ...base, rows: [...base.rows!, envelopeRow(true)] }, [windows]);
  expect(agreeing.mismatches).toEqual([]);
  const stored = (agreeing.receipt as ContextReceiptData).rows!.find((r) => r.key === "window_forms");
  expect(stored?.consumed_into).toEqual(["window::Add more cards"]);
  captured.length = 0;
  const lying = run("r1", { ...base, rows: [...base.rows!, envelopeRow(false)] }, [windows]);
  expect(lying.mismatches).toEqual([
    expect.objectContaining({ key: "window_forms", field: "include", expected: true, actual: false }),
  ]);
});
