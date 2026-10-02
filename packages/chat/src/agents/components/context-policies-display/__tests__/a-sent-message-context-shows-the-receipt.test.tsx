/**
 * The sent message's context popover renders the SERVER'S receipt rows —
 * what was sent, what was off and why — read-only (RULES.md §5).
 *
 * Breaks this catches: the popover rendering anything but the receipt's rows
 * (the old live-value list), dropping the person's "off" row, letting a
 * historical turn be edited, or hiding that a model reads no context.
 *
 * Fixture: two live `context_receipt` events from /notes, 2026-09-30.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@/types/python-generated/stream-events";
import { MessageContextReceipt } from "../MessageContextReceipt";
import captured from "@/features/agents/redux/execution-system/messages/__tests__/fixtures/notes-context-receipts.json";

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

function openFor(receipt: ContextReceiptData) {
  act(() => root.render(<MessageContextReceipt receipt={receipt} />));
  const trigger = host.querySelector("button")!;
  act(() => {
    trigger.click();
  });
  const table = document.body.querySelector('[role="table"]');
  if (!table) throw new Error("the context popover never opened its table");
  return { trigger, table };
}

function rowsOf(table: Element) {
  return [...table.querySelectorAll('[role="row"][data-key]')].map((r) => ({
    key: r.getAttribute("data-key"),
    included: r.getAttribute("data-included"),
    chars: r.querySelectorAll('[role="cell"]')[2]?.textContent,
    limit: (r.querySelector("input") as HTMLInputElement | null)?.placeholder,
    locked: (r.querySelector('[role="switch"]') as HTMLButtonElement | null)?.disabled,
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
  expect(rows.every((r) => r.locked === true)).toBe(true);
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
  expect(document.body.textContent).toContain("This model can't read context");
});
