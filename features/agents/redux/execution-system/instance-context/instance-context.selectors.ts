import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";

const EMPTY_CONTEXT_ENTRIES: InstanceContextEntry[] = [];

export const selectInstanceContextEntries = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const values = Object.values(context);
      return values.length === 0 ? EMPTY_CONTEXT_ENTRIES : values;
    },
  );

export const selectInstanceContextEntry =
  (conversationId: string, key: string) =>
  (state: RootState): InstanceContextEntry | undefined =>
    state.instanceContext.byConversationId[conversationId]?.[key];

/**
 * Context entries that match agent-defined slots.
 */
export const selectSlotMatchedContext = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const filtered = Object.values(context).filter((e) => e.slotMatched);
      return filtered.length === 0 ? EMPTY_CONTEXT_ENTRIES : filtered;
    },
  );

/**
 * Ad-hoc context entries (not matching any slot).
 */
export const selectAdHocContext = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const filtered = Object.values(context).filter((e) => !e.slotMatched);
      return filtered.length === 0 ? EMPTY_CONTEXT_ENTRIES : filtered;
    },
  );

/**
 * Wire form for one context entry (D12 fix, 2026-07-07).
 *
 * PRIMITIVE values (string / number / boolean) are wrapped in the backend's
 * rich per-request form `{content, type, label}` so the entry's authored
 * label + type reach the manifest instead of being dropped. `max_inline_chars`
 * is deliberately OMITTED: the backend keeps it `null` for a rich dict exactly
 * as for a bare value (agent-slot value, else the 200-char system default), so
 * inline-vs-deferred behavior is byte-identical — setting it explicitly would
 * clobber slots configured with a higher ceiling via the backend's
 * `min(agent, surface)` rule (see aidream `context_objects.py`).
 *
 * Everything else passes through untouched: already-rich dicts
 * (`buildWorkingDocumentContextValue`, `sessionResourceContext`), raw JSON
 * dicts/arrays (legacy raw-content form), and null/undefined.
 */
export function toWireContextValue(entry: InstanceContextEntry): unknown {
  const v = entry.value;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return { content: v, type: entry.type, label: entry.label };
  }
  return v;
}

/**
 * Build the context dict for the API payload.
 * Returns Record<string, ContextValue> ready for the request.
 */
export const selectContextPayload =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> | undefined => {
    const context = state.instanceContext.byConversationId[conversationId];
    if (!context) return undefined;

    const entries = Object.values(context);
    if (entries.length === 0) return undefined;

    const payload: Record<string, unknown> = {};
    for (const entry of entries) {
      payload[entry.key] = toWireContextValue(entry);
    }
    return payload;
  };
