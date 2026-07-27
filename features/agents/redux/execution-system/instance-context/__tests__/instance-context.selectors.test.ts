/**
 * Pins the wire contract for `selectContextPayload` / `toWireContextValue`
 * (D12 fix): entry-level `label` + `type` reach the backend for PRIMITIVE
 * values via the rich per-request form, WITHOUT changing inline-vs-deferred
 * behavior (no `max_inline_chars` is ever emitted — the backend default /
 * agent-slot ceiling must keep applying exactly as for a bare value).
 *
 * If a refactor re-flattens primitives to bare values (labels dropped) or
 * starts emitting `max_inline_chars` (slot ceilings clobbered by the
 * backend's min(agent, surface) rule), this file fails loudly.
 */

import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  selectContextPayload,
  toWireContextValue,
} from "../instance-context.selectors";
import type { RootState } from "@/lib/redux/store";

function entry(
  partial: Partial<InstanceContextEntry> & { key: string; value: unknown },
): InstanceContextEntry {
  return {
    slotMatched: false,
    type: "text",
    label: partial.key,
    ...partial,
  } as InstanceContextEntry;
}

function stateWith(entries: InstanceContextEntry[]): RootState {
  const map: Record<string, InstanceContextEntry> = {};
  for (const e of entries) map[e.key] = e;
  return {
    instanceContext: { byConversationId: { "conv-1": map } },
  } as unknown as RootState;
}

describe("toWireContextValue", () => {
  it("wraps string values into rich form carrying label + type", () => {
    const wire = toWireContextValue(
      entry({
        key: "active_file",
        value: "line one",
        type: "text",
        label: "Active File",
      }),
    );
    expect(wire).toEqual({
      content: "line one",
      type: "text",
      label: "Active File",
    });
  });

  it("wraps number and boolean primitives", () => {
    expect(
      toWireContextValue(
        entry({ key: "n", value: 42, type: "text", label: "Count" }),
      ),
    ).toEqual({ content: 42, type: "text", label: "Count" });
    expect(
      toWireContextValue(
        entry({ key: "b", value: true, type: "text", label: "Flag" }),
      ),
    ).toEqual({ content: true, type: "text", label: "Flag" });
  });

  it("NEVER emits max_inline_chars (inline-vs-deferred must stay backend-owned)", () => {
    const long = "x".repeat(5000); // a transcript-sized string must not flip behavior
    const wire = toWireContextValue(
      entry({ key: "transcript", value: long, label: "Transcript" }),
    ) as Record<string, unknown>;
    expect(wire.content).toBe(long);
    expect("max_inline_chars" in wire).toBe(false);
  });

  it("passes already-rich dict values through untouched (same reference)", () => {
    const rich = {
      content: "doc body",
      mutable: true,
      persist: "auto",
      source: { kind: "working_document", id: "wd-1" },
      label: "Working Document",
    };
    expect(toWireContextValue(entry({ key: "doc", value: rich }))).toBe(rich);
  });

  it("keeps an explicitly attached scope cell as a lazy source pointer", () => {
    const pointer = {
      content: null,
      type: "text",
      label: "All Green — General Brand Profile",
      persist: "never",
      source: {
        kind: "ctx_item",
        id: "item-1",
        scope_id: "scope-1",
        scope_type_id: "type-1",
        item_key: "general_brand_profile",
      },
    };
    expect(
      toWireContextValue(
        entry({
          key: "attached_scope_item_scope-1_item-1",
          value: pointer,
        }),
      ),
    ).toBe(pointer);
  });

  it("passes raw JSON dicts / arrays / null through untouched", () => {
    const raw = { a: 1, nested: { b: 2 } };
    expect(toWireContextValue(entry({ key: "j", value: raw }))).toBe(raw);
    const arr = [1, 2, 3];
    expect(toWireContextValue(entry({ key: "l", value: arr }))).toBe(arr);
    expect(toWireContextValue(entry({ key: "z", value: null }))).toBeNull();
  });
});

describe("selectContextPayload", () => {
  it("returns undefined when no context exists / no entries", () => {
    expect(selectContextPayload("missing")(stateWith([]))).toBeUndefined();
    expect(selectContextPayload("conv-1")(stateWith([]))).toBeUndefined();
  });

  it("builds the payload with primitives wrapped and dicts passed through", () => {
    const rich = { content: "body", mutable: true };
    const state = stateWith([
      entry({
        key: "title",
        value: "Q3 Report",
        type: "text",
        label: "Report Title",
      }),
      entry({ key: "doc", value: rich }),
    ]);
    expect(selectContextPayload("conv-1")(state)).toEqual({
      title: { content: "Q3 Report", type: "text", label: "Report Title" },
      doc: rich,
    });
  });
});
