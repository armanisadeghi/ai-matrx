/**
 * Declared offer values of provision `conversation.analysis`, sent by name
 * beside `conversation_id`. The analysis panel launches on the MANDATE door
 * (`launchAgentExecution({ mandateKey })`), where the server drops these
 * mapped-only names unless a binding's consumption map names one — so the
 * current Holders receive exactly what they did before. Every value comes from
 * the conversation row the host page already loaded; absent facts are omitted.
 */

import type { ConversationAnalysisOffer } from "@/types/python-generated/provision-offers";

/** The loaded conversation-row facts this offer reads (all optional). */
export interface ConversationAnalysisFacts {
  title?: string | null;
  description?: string | null;
  conversation_type?: string | null;
  source_app?: string | null;
  message_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  initial_agent_id?: string | null;
}

export type ConversationAnalysisOfferValues = Omit<
  Partial<ConversationAnalysisOffer>,
  "__kind" | "conversation_id"
>;

export function buildConversationAnalysisOffer(
  facts: ConversationAnalysisFacts | null | undefined,
): ConversationAnalysisOfferValues {
  if (!facts) return {};
  const out: ConversationAnalysisOfferValues = {};
  const text = (v: string | null | undefined) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const put = <K extends keyof ConversationAnalysisOfferValues>(
    key: K,
    value: ConversationAnalysisOfferValues[K] | undefined,
  ) => {
    if (value !== undefined) out[key] = value;
  };
  put("conversation_title", text(facts.title));
  put("conversation_description", text(facts.description));
  put("conversation_type", text(facts.conversation_type));
  put("source_app", text(facts.source_app));
  put(
    "message_count",
    typeof facts.message_count === "number" && Number.isFinite(facts.message_count)
      ? facts.message_count
      : undefined,
  );
  put("created_at", text(facts.created_at));
  put("updated_at", text(facts.updated_at));
  put("initial_agent_id", text(facts.initial_agent_id));
  return out;
}
