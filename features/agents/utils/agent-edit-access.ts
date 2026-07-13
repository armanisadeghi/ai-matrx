/**
 * Agent edit access — the pure core of "can the agent change this context slot?".
 *
 * The wire shape is `mutable` + `persist` on `ContextSlot` (see `agent-api-types`),
 * but "mutable" is jargon nobody outside this codebase reads correctly, so it
 * appears NOWHERE in the UI. Users pick between:
 *
 *   Read-only      — the agent can read this, never change it.   (mutable absent)
 *   Agent can edit — the agent may rewrite it while it works.    (mutable: true)
 *
 * and, when editable, where those edits land ("Where the agent's edits go"):
 *
 *   This conversation only  → persist "never"   (in-memory; gone after the turn)
 *   Save to the source      → persist "auto"    (server writeback dispatcher)
 *   The app saves it        → persist "client"  (client owns persistence)
 *
 * WRITEBACK IS NOT UNIVERSAL. `persist: "auto"` only lands if aidream has a
 * writeback handler registered for the slot's `source.kind`
 * (`aidream/services/conversation_context/context_writeback.py` — today: note,
 * studio_document, working_document, canvas_item, cx_ai_data_records). A kind
 * with no handler is a SILENT server-side no-op, so a surface offering that mode
 * for an unsupported kind is promising a save that never happens — see
 * `SCOPE_ITEM_NO_WRITEBACK_REASON`.
 *
 * Pure — no React, no persistence. The controls live in
 * `components/context-slots-management/AgentEditAccessControl.tsx`.
 */

import type {
  ContextSlot,
  ContextSlotPersist,
} from "@/features/agents/types/agent-api-types";

/** What the agent is allowed to do with a slot. The UI never says "mutable". */
export type AgentEditAccess = "read_only" | "editable";

export interface AgentEditAccessValue {
  access: AgentEditAccess;
  /** Where the agent's edits go. Only meaningful when access === "editable". */
  saveMode: ContextSlotPersist;
}

export const DEFAULT_AGENT_EDIT_ACCESS: AgentEditAccessValue = {
  access: "read_only",
  saveMode: "never",
};

export const AGENT_EDIT_ACCESS_LABEL: Record<AgentEditAccess, string> = {
  read_only: "Read-only",
  editable: "Agent can edit",
};

/**
 * aidream has no `ctx_item` writeback handler, so a scope-bound slot can never
 * save the agent's edits back to the scope item — the server drops them without
 * a word. Surfaces take the option away and show this instead.
 */
export const SCOPE_ITEM_NO_WRITEBACK_REASON =
  "Scope-bound slots can't be saved back to the scope item yet — the agent's edits last for the conversation.";

export interface AgentEditSaveMode {
  id: ContextSlotPersist;
  label: string;
  hint: string;
}

export const AGENT_EDIT_SAVE_MODES: AgentEditSaveMode[] = [
  {
    id: "never",
    label: "This conversation only",
    hint: "The agent's edits last for the conversation, then they're gone. Nothing is saved.",
  },
  {
    id: "auto",
    label: "Save to the source",
    hint: "The agent's edits are written back to the record this slot came from.",
  },
  {
    id: "client",
    label: "The app saves it",
    hint: "The surface that opened this conversation owns saving the agent's edits.",
  },
];

/** One-line plain-English summary of where an editable slot's edits go. */
export const AGENT_EDIT_SAVE_SUMMARY: Record<ContextSlotPersist, string> =
  AGENT_EDIT_SAVE_MODES.reduce(
    (acc, mode) => ({ ...acc, [mode.id]: mode.hint }),
    {} as Record<ContextSlotPersist, string>,
  );

/** Read a slot's access. Absent `mutable` means read-only — the server default. */
export function decodeAgentEditAccess(
  slot: Pick<ContextSlot, "mutable" | "persist"> | undefined | null,
): AgentEditAccessValue {
  if (!slot?.mutable) return DEFAULT_AGENT_EDIT_ACCESS;
  return { access: "editable", saveMode: slot.persist ?? "never" };
}

/**
 * Write access onto a slot. Read-only strips `mutable`/`persist` entirely rather
 * than writing `mutable: false` — an absent flag is the server's own default and
 * keeps stored slots clean.
 */
export function applyAgentEditAccess<T extends ContextSlot>(
  slot: T,
  value: AgentEditAccessValue,
): T {
  const next = { ...slot };
  if (value.access === "editable") {
    next.mutable = true;
    next.persist = value.saveMode;
  } else {
    delete next.mutable;
    delete next.persist;
  }
  return next;
}

/** True when the two values would produce a different stored slot. */
export function agentEditAccessChanged(
  a: AgentEditAccessValue,
  b: AgentEditAccessValue,
): boolean {
  if (a.access !== b.access) return true;
  return a.access === "editable" && a.saveMode !== b.saveMode;
}
