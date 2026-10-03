/**
 * The sent message's receipt (its canvas tab's table) renders the SERVER'S
 * receipt rows — what was sent, what was off and why — read-only (RULES.md §5).
 * The pill on the message toggles that tab, keyed by the message.
 *
 * Breaks this catches: the popover rendering anything but the receipt's rows
 * (the old live-value list), dropping the person's "off" row, letting a
 * historical turn be edited (any switch on a sent row), or hiding that a model reads no context.
 *
 * Fixture: two live `context_receipt` events from /notes, 2026-09-30.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@ai-matrx/agents/generated/stream-events";
import { MessageContextReceipt, MessageContextReceiptTable } from "../MessageContextReceipt";

const presses: Array<{ title: string; data: Record<string, unknown> }> = [];
let tabRef: { kind: string; key: string } | null = null;
jest.mock("../../../../host/canvas", () => ({
  useChatCanvasTab: (ref: { kind: string; key: string }) => {
    tabRef = ref;
    return {
      isAvailable: true,
      isVisible: false,
      selected: null,
      toggle: (open: { title: string; data: Record<string, unknown> }) => presses.push(open),
    };
  },
}));
import captured from "../../../redux/execution-system/messages/__tests__/fixtures/notes-context-receipts.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIRST = captured.first as ContextReceiptData;
const SECOND = captured.second as ContextReceiptData;

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  // Radix popper measures; jsdom has no ResizeObserver.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function pill(receipt: ContextReceiptData) {
  act(() =>
    root.render(<MessageContextReceipt conversationId="c-1" messageId="m-1" receipt={receipt} />),
  );
  return host.querySelector("button")!;
}

function openFor(receipt: ContextReceiptData) {
  const trigger = pill(receipt);
  // The pill toggles the message's canvas tab, whose body is the table.
  presses.length = 0;
  act(() => trigger.click());
  expect(tabRef).toEqual({ kind: "message-context-receipt", key: "m-1" });
  expect(presses[0]?.data).toEqual({ conversationId: "c-1", messageId: "m-1" });
  const summary = trigger.textContent;
  act(() => root.render(<MessageContextReceiptTable receipt={receipt} />));
  const table = document.body.querySelector('[role="table"]');
  if (!table) throw new Error("the receipt table never rendered");
  return { trigger: { textContent: summary }, table };
}

function rowsOf(table: Element) {
  return [...table.querySelectorAll('[role="row"][data-key]')].map((r) => ({
    key: r.getAttribute("data-key"),
    included: r.getAttribute("data-included"),
    chars: r.querySelectorAll('[role="cell"]')[2]?.textContent,
    limit: (r.querySelector("input") as HTMLInputElement | null)?.placeholder,
    // A sent turn is frozen (@ai-matrx/agents 0.43.9+): no switch at all, a
    // static lock mark whose state is what the turn sent. A disabled switch
    // still reads as a control, so "locked" means "no switch, one mark".
    hasSwitch: r.querySelector('[role="switch"]') !== null,
    frozen: r.querySelector("[data-frozen-include]")?.getAttribute("data-frozen-include") ?? null,
  }));
}

it.each([
  ["turn 1", FIRST, "8 sent", 8, [] as string[]],
  ["turn 2", SECOND, "2 sent · 1 off", 3, ["open_notes_summary"]],
])("shows exactly the receipt's rows for %s", (_name, receipt, summary, count, offKeys) => {
  const { trigger, table } = openFor(receipt);
  expect(trigger.textContent).toContain(summary);
  const rows = rowsOf(table);
  expect(rows.map((r) => r.key).sort()).toEqual(receipt.rows!.map((r) => r.key).sort());
  expect(rows).toHaveLength(count);
  expect(rows.filter((r) => r.included === "false").map((r) => r.key)).toEqual(offKeys);
  expect(rows.filter((r) => r.hasSwitch).map((r) => r.key)).toEqual([]);
  for (const r of rows) expect([r.key, r.frozen]).toEqual([r.key, r.included === "false" ? "off" : "on"]);
});

it("shows the limit the server applied and the size it measured", () => {
  const { table } = openFor(FIRST);
  const bundle = rowsOf(table).find((r) => r.key === "note_bundle")!;
  expect(bundle.limit).toBe("12000");
  expect(bundle.chars).toBe("3.5k");
  const before = rowsOf(table).find((r) => r.key === "text_before")!;
  expect(before.limit).toBe("2500");
});

it("says so when the model reads no context", () => {
  const blind: ContextReceiptData = {
    ...FIRST,
    model_reads_context: false,
    rows: FIRST.rows!.map((r) => ({ ...r, delivery: "off", blocked_by: "model" })),
  };
  openFor(blind);
  expect(document.body.textContent).toContain("This model can't read these values");
});

it("the sent-message badge is a count with no generic word (Arman, 2026-10-01)", () => {
  const trigger = pill(FIRST);
  expect(trigger.textContent).toBe("8 sent");
  expect(trigger.getAttribute("aria-label") ?? "").not.toMatch(/context/i);
});
