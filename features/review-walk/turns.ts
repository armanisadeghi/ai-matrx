/**
 * features/review-walk/turns.ts
 *
 * TRUE-TURN model for the Diagnose window. A turn is what the USER experiences:
 * one real user message followed by the agent's whole response — which may
 * internally span several persisted assistant rows (one per iteration),
 * thinking blocks, tool calls and tool results. Provider-level framing (tool
 * results riding as "user" messages on the wire) must NEVER surface here.
 *
 * Data comes DIRECT from Supabase through the ONE canonical bundle fetcher
 * (`fetchConversationBundle` — the same RPC `/chat` hydration uses), and
 * message content is parsed through the ONE persisted-content boundary
 * (`parsePersistedMessageContent`). No second parser, no second fetch path.
 */

import {
  fetchConversationBundle,
  type CxMessageRow,
  type CxToolCallRow,
} from "@/features/agents/redux/execution-system/thunks/conversation-bundle";
import { parsePersistedMessageContent } from "@/features/agents/redux/execution-system/messages/persisted-content-boundary";
import type { MessagePart } from "@/types/python-generated/stream-events";

// ── shapes ──────────────────────────────────────────────────────────────────

export interface TurnContextItem {
  /** Matches the descend service's `context:{key}` input key exactly. */
  key: string;
  label: string;
  sourceKind: string | null;
  sizeHint: string | number | null;
  /** The item's payload when carried inline; deferred slots carry none. */
  value: unknown;
  raw: unknown;
}

export interface TurnAttachment {
  /** Matches the descend service's `attachment:{type|idx}` input key. */
  key: string;
  label: string;
  type: string | null;
  raw: unknown;
}

/** One piece of the agent's response, in the order it happened. */
export type AssistantPart =
  | { kind: "thinking"; seq: number; text: string }
  | { kind: "text"; seq: number; text: string }
  | {
      kind: "tool";
      seq: number;
      callId: string;
      name: string;
      args: Record<string, unknown> | null;
      /** Joined observability row — arguments, output, success, timing. */
      row: CxToolCallRow | null;
    }
  | { kind: "media"; seq: number; mediaKind: string; raw: unknown }
  | { kind: "opaque"; seq: number; label: string; raw: unknown };

export interface ConversationTurn {
  /** 1-based, in conversation order — the tab label. */
  index: number;
  userMessageId: string | null;
  /** What the human actually typed/dictated (text parts only). */
  userText: string;
  userRaw: CxMessageRow | null;
  contextItems: TurnContextItem[];
  attachments: TurnAttachment[];
  /** `tools_on_call` from the trigger message — the offered toolset. */
  toolsOnCall: unknown[];
  /** Delivered agent-collaboration notes on this turn (machine-written). */
  collabNotes: { id: string; text: string }[];
  assistantMessageIds: string[];
  /** The LAST assistant row of the turn — the walk root for this turn. */
  rootAssistantMessageId: string | null;
  parts: AssistantPart[];
  hasError: boolean;
}

export interface ConversationTurns {
  conversationId: string;
  turns: ConversationTurn[];
  /** True when older history exists beyond the fetched window. */
  hasOlder: boolean;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse a persisted content column without ever throwing — this is a
 * diagnostic surface; a malformed row must render as opaque, not crash. */
function safeParts(content: unknown): {
  parts: MessagePart[];
  opaque: unknown[];
} {
  try {
    const entries = parsePersistedMessageContent(content);
    return {
      parts: entries.flatMap((e) => (e.kind === "message_part" ? [e.part] : [])),
      opaque: [],
    };
  } catch {
    return { parts: [], opaque: Array.isArray(content) ? content : [content] };
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  const { parts } = safeParts(content);
  return parts
    .flatMap((p) =>
      p.type === "text" && typeof p.text === "string" ? [p.text] : [],
    )
    .join("\n")
    .trim();
}

function isCollabNoteRow(row: CxMessageRow): boolean {
  if (row.role !== "user") return false;
  if (isRecord(row.metadata) && "agent_collab" in row.metadata) return true;
  return textFromContent(row.content).startsWith("[Collaboration note]");
}

/** Same key derivation the descend service uses — keeps the turn item and its
 * provenance-tagged descend input joinable. */
function contextItemsFrom(row: CxMessageRow): TurnContextItem[] {
  const record = isRecord(row.model_context) ? row.model_context : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return items.flatMap((item): TurnContextItem[] => {
    if (!isRecord(item)) return [];
    const key = String(item.key ?? item.type ?? "context");
    const sizeHint = item.size_hint;
    return [
      {
        key: `context:${key}`,
        label: String(item.label ?? key),
        sourceKind:
          typeof item.source_kind === "string" ? item.source_kind : null,
        sizeHint:
          typeof sizeHint === "string" || typeof sizeHint === "number"
            ? sizeHint
            : null,
        value: item.value ?? null,
        raw: item,
      },
    ];
  });
}

function attachmentsFrom(row: CxMessageRow): TurnAttachment[] {
  const record = isRecord(row.model_context) ? row.model_context : {};
  const items = Array.isArray(record.input_items) ? record.input_items : [];
  return items.flatMap((item, idx): TurnAttachment[] => {
    if (!isRecord(item)) return [];
    const type = typeof item.type === "string" ? item.type : null;
    return [
      {
        key: `attachment:${type ?? idx}`,
        label: String(item.label ?? item.type ?? `attachment ${idx}`),
        type,
        raw: item,
      },
    ];
  });
}

function assistantPartsFrom(
  row: CxMessageRow,
  toolRowsByCallId: Map<string, CxToolCallRow>,
  startSeq: number,
): AssistantPart[] {
  const { parts, opaque } = safeParts(row.content);
  const out: AssistantPart[] = [];
  let seq = startSeq;

  for (const part of parts) {
    switch (part.type) {
      case "text": {
        if (part.text && part.text.trim()) {
          out.push({ kind: "text", seq: seq++, text: part.text });
        }
        break;
      }
      case "thinking": {
        let text = part.text ?? "";
        if (!text && Array.isArray(part.summary)) {
          text = part.summary
            .map((s) =>
              typeof s === "string"
                ? s
                : isRecord(s) && typeof s.text === "string"
                  ? s.text
                  : "",
            )
            .filter(Boolean)
            .join("\n");
        }
        if (text.trim()) out.push({ kind: "thinking", seq: seq++, text });
        break;
      }
      case "tool_call": {
        const legacyId = (part as { id?: string }).id;
        const callId = part.call_id ?? legacyId ?? `unknown-${seq}`;
        out.push({
          kind: "tool",
          seq: seq++,
          callId,
          name: part.name ?? toolRowsByCallId.get(callId)?.tool_name ?? "tool",
          args:
            isRecord(part.arguments) && !Array.isArray(part.arguments)
              ? part.arguments
              : null,
          row: toolRowsByCallId.get(callId) ?? null,
        });
        break;
      }
      case "tool_result":
        // Results are joined onto their tool_call part via the row — a
        // standalone result stub must not render as its own event.
        break;
      case "media": {
        out.push({
          kind: "media",
          seq: seq++,
          mediaKind: (part as { kind?: string }).kind ?? "media",
          raw: part,
        });
        break;
      }
      default: {
        out.push({
          kind: "opaque",
          seq: seq++,
          label: String((part as { type?: string }).type ?? "content"),
          raw: part,
        });
      }
    }
  }
  for (const raw of opaque) {
    out.push({ kind: "opaque", seq: seq++, label: "unparsed content", raw });
  }
  return out;
}

// ── loader ──────────────────────────────────────────────────────────────────

/**
 * Load the conversation's recent history and fold it into TRUE turns.
 * Tool/system rows never become turns; collaboration notes never render as
 * something the human typed; multi-iteration assistant rows merge into ONE
 * response timeline.
 */
export async function loadConversationTurns(
  conversationId: string,
): Promise<ConversationTurns> {
  const bundle = await fetchConversationBundle(conversationId, {
    messageLimit: 100,
    skipObservabilityFallback: true,
  });

  const toolRowsByCallId = new Map<string, CxToolCallRow>();
  for (const row of bundle.tool_calls ?? []) {
    if (row.call_id) toolRowsByCallId.set(row.call_id, row);
  }

  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | null = null;

  const newTurn = (userRow: CxMessageRow | null): ConversationTurn => {
    const turn: ConversationTurn = {
      index: turns.length + 1,
      userMessageId: userRow ? userRow.id : null,
      userText: userRow ? textFromContent(userRow.content) : "",
      userRaw: userRow,
      contextItems: userRow ? contextItemsFrom(userRow) : [],
      attachments: userRow ? attachmentsFrom(userRow) : [],
      toolsOnCall:
        userRow && Array.isArray(userRow.tools_on_call)
          ? userRow.tools_on_call
          : [],
      collabNotes: [],
      assistantMessageIds: [],
      rootAssistantMessageId: null,
      parts: [],
      hasError: false,
    };
    turns.push(turn);
    return turn;
  };

  // The bundle RPC returns messages newest-first; folding into turns needs
  // conversation order. (position asc; created_at breaks retry ties.)
  const ordered = [...(bundle.messages ?? [])].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });

  for (const row of ordered) {
    if (row.role === "tool" || row.role === "system") continue;
    if (row.role === "user") {
      if (isCollabNoteRow(row)) {
        // A delivered agent-collaboration note — machine-written, belongs to
        // the turn in progress, never a turn of its own.
        const turn: ConversationTurn = current ?? newTurn(null);
        current = turn;
        turn.collabNotes.push({
          id: row.id,
          text: textFromContent(row.content),
        });
        continue;
      }
      current = newTurn(row);
      continue;
    }
    if (row.role === "assistant") {
      const turn: ConversationTurn = current ?? newTurn(null);
      current = turn;
      turn.assistantMessageIds.push(row.id);
      turn.rootAssistantMessageId = row.id;
      if (row.error != null) turn.hasError = true;
      turn.parts.push(
        ...assistantPartsFrom(row, toolRowsByCallId, turn.parts.length),
      );
    }
  }

  return {
    conversationId,
    turns,
    hasOlder: Boolean(bundle.pagination?.has_more),
  };
}

/** Which turn holds the walked unit (an assistant or user message id). */
export function turnIndexForMessage(
  turns: ConversationTurn[],
  messageId: string,
): number {
  return turns.findIndex(
    (t) =>
      t.userMessageId === messageId ||
      t.assistantMessageIds.includes(messageId),
  );
}
