// components/official-candidate/transcription-cleanup/cleanupOffer.ts
//
// The offered values a Transcription Cleanup launch holds as REAL facts, sent
// by name beside the transcript / context it already sends. Each of the three
// cleanup mandates offers a different set (aidream client_mandates.py):
//   transcripts.cleanup_plain            → entry_count, first/last_entry_at, was_edited
//   transcripts.cleanup_context_slot     → context_items, transcript_segments,
//   transcripts.cleanup_context_variable   previous_cleaned_text, raw_word_count
// All are mapped-only on the MANDATE door (useAiPostProcess posts to
// /ai/mandates/{key}), so the default pin drops them and current Holders
// receive exactly what they did before. Absent facts are omitted.

import type {
  TranscriptsCleanupContextSlotOffer,
  TranscriptsCleanupContextVariableOffer,
  TranscriptsCleanupPlainOffer,
} from "@/types/python-generated/provision-offers";
import type { AiPostProcessAgent } from "./ai-agents";

export interface CleanupSessionFacts {
  /** The recorded transcript entries, in order. */
  entries: readonly { text: string; timestamp: number }[];
  /** True when the Expert edited the transcript text by hand. */
  wasEdited: boolean;
  /** The exact transcript text being sent. */
  transcript: string;
  /** The context text being sent (the context panel's blocks, combined). */
  context: string;
  /** The cleaned output on screen before this run, if any. */
  previousCleanedText?: string | null;
}

export type CleanupOfferVariables =
  | Partial<TranscriptsCleanupPlainOffer>
  | Partial<TranscriptsCleanupContextSlotOffer>
  | Partial<TranscriptsCleanupContextVariableOffer>;

const BY_NAME = new Set([
  "transcript",
  "user_context",
  "transcribed_text",
  "transcription_user_context",
  "context",
]);

function iso(ms: number): string | null {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

export function cleanupOfferVariables(
  agent: Pick<AiPostProcessAgent, "id">,
  facts: CleanupSessionFacts,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (agent.id === "clean_without_context") {
    const plain: Partial<TranscriptsCleanupPlainOffer> = {
      entry_count: facts.entries.length,
      was_edited: facts.wasEdited,
    };
    const first = facts.entries[0];
    const last = facts.entries[facts.entries.length - 1];
    const firstAt = first ? iso(first.timestamp) : null;
    const lastAt = last ? iso(last.timestamp) : null;
    if (firstAt) plain.first_entry_at = firstAt;
    if (lastAt) plain.last_entry_at = lastAt;
    Object.assign(out, plain);
  } else if (
    agent.id === "clean_with_context" ||
    agent.id === "clean_with_context_variable"
  ) {
    const ctx: Partial<TranscriptsCleanupContextSlotOffer> &
      Partial<TranscriptsCleanupContextVariableOffer> = {};
    const words = facts.transcript.trim().split(/\s+/).filter(Boolean).length;
    if (words > 0) ctx.raw_word_count = words;
    const segments = facts.entries.map((e) => e.text).filter((t) => t.trim());
    if (segments.length > 0) ctx.transcript_segments = segments;
    if (facts.context.trim()) ctx.context_items = facts.context.trim();
    if (facts.previousCleanedText?.trim())
      ctx.previous_cleaned_text = facts.previousCleanedText;
    Object.assign(out, ctx);
  }
  // Never touch a by-name variable — only ADD offered keys.
  for (const k of Object.keys(out)) if (BY_NAME.has(k)) delete out[k];
  return out;
}
