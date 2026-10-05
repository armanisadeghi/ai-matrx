// features/vision-interview/group-chat/latestTurn.ts
//
// One participant's latest turn, read straight from `chat.message` (RLS: the person reads their
// own interview's rows): the user row that carries the turn's context receipt — its `room_view`
// manifest says what the participant was shown, digested and withheld, and why — and the
// assistant reply that followed it. The withheld messages are read too, so the inspector can say
// WHAT was withheld, not only how many.

import type { ContextReceiptData } from "@ai-matrx/agents/generated/stream-events";
import { createClient } from "@/utils/supabase/client";

export type RoomViewManifest = NonNullable<ContextReceiptData["room_view"]>;

export interface LatestTurn {
  /** The user row the receipt is on — the viewer door (`/ai/context/delivered`) reads by it. */
  messageId: string;
  conversationId: string;
  receipt: ContextReceiptData;
  roomView: RoomViewManifest | null;
  /** What the participant said back (text parts, oldest first); null while it has not answered. */
  reply: string | null;
  /** The provider's finish reason for the reply (`metadata.finish_reason`), when stored. */
  finishReason: string | null;
  /** message id → its text, for every withheld message the person can read. */
  withheldText: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A stored message's visible words: its text parts (never thinking, never tool rows). */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => (part as { text: string }).text)
    .join("\n\n")
    .trim();
}

/** The persisted receipt on a user row (`model_context.delivery.receipt`), when it is one. */
export function receiptOf(modelContext: unknown): ContextReceiptData | null {
  if (!isRecord(modelContext) || !isRecord(modelContext.delivery)) return null;
  const receipt = modelContext.delivery.receipt;
  return isRecord(receipt) && typeof receipt.cap === "number" && Array.isArray(receipt.rows)
    ? (receipt as unknown as ContextReceiptData)
    : null;
}

/** The finish reason a reply's metadata carries, or null. */
export function finishReasonOf(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const reason = metadata.finish_reason ?? metadata.finishReason;
  return typeof reason === "string" && reason ? reason : null;
}

/** True when the provider stopped the reply at its output ceiling — the words end where the limit fell. */
export function hitOutputLimit(finishReason: string | null): boolean {
  return finishReason !== null && /^(length|max_tokens|max_output_tokens|max_tokens_exceeded)$/i.test(finishReason);
}

export async function fetchLatestTurn(conversationId: string): Promise<LatestTurn | null> {
  const supabase = createClient();
  const turn = await supabase
    .schema("chat")
    .from("message")
    .select("id, position, model_context")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .is("deleted_at", null)
    .not("model_context->delivery->receipt", "is", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (turn.error) throw new Error(turn.error.message);
  const receipt = turn.data ? receiptOf(turn.data.model_context) : null;
  if (!turn.data || !receipt) return null;
  const roomView = receipt.room_view ?? null;
  const withheldIds = [...new Set((roomView?.withheld ?? []).map((w) => w.message_id))].slice(0, 100);

  const [reply, withheld] = await Promise.all([
    supabase
      .schema("chat")
      .from("message")
      .select("content, metadata, status, error")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .is("deleted_at", null)
      .gt("position", turn.data.position)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle(),
    withheldIds.length
      ? supabase.schema("chat").from("message").select("id, content").in("id", withheldIds)
      : Promise.resolve({ data: [] as { id: string; content: unknown }[], error: null }),
  ]);
  if (reply.error) throw new Error(reply.error.message);
  if (withheld.error) throw new Error(withheld.error.message);

  const withheldText: Record<string, string> = {};
  for (const row of withheld.data ?? []) withheldText[row.id] = messageText(row.content);
  return {
    messageId: turn.data.id,
    conversationId,
    receipt,
    roomView,
    reply: reply.data ? messageText(reply.data.content) || null : null,
    finishReason: finishReasonOf(reply.data?.metadata),
    withheldText,
  };
}
