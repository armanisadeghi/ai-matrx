/**
 * AI post-processing agents available in the TranscriptionCleanup pad.
 *
 * Each agent declares the variable key that should receive the transcribed
 * text and, optionally, either a context policy OR a context variable that
 * should receive free-form user context. Variable and slot keys differ per
 * agent — the pad wires them up by name when it launches the agent.
 *
 * 🚨 NO AGENT IDS HERE (2026-09-25). Each variant names the MANDATE that
 * decides its Holder (`transcripts.clean_*`, declared in aidream
 * `services/mandates/client_mandates.py`, seeded with the agent this file used
 * to hard-code). `useAiPostProcess` resolves the mandate per run and launches
 * through the mandate door, so rebinding a mandate in the admin console
 * changes what runs here. `id` is only this pad's local variant key.
 *
 * The variable/slot keys below describe the SEED Holder's input shape. A
 * Holder rebound to an agent with different keys is refused loudly by the
 * run (missing variable), never silently fed the wrong field.
 */
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";

export interface AiPostProcessAgent {
  /** Local variant key for the picker — NOT an agent id. */
  id: string;
  /** The mandate whose current Holder does this variant's cleaning. */
  mandateKey: AnyMandateKey;
  name: string;
  /** Variable key that receives the full transcribed text. */
  transcriptVariableKey: string;
  /** Optional context policy key for user-typed context (slot-based agents). */
  contextPolicyKey?: string;
  /** Optional variable key for user-typed context (variable-based agents). */
  contextVariableKey?: string;
}

export const AI_POST_PROCESS_AGENTS: AiPostProcessAgent[] = [
  {
    id: "clean_with_context",
    mandateKey: dbAuthoredMandateKey("transcripts.clean_with_context"),
    name: "Transcription Cleaner Context Policies",
    transcriptVariableKey: "transcribed_text",
    contextPolicyKey: "transcription_user_context",
  },
  {
    id: "clean_with_context_variable",
    mandateKey: dbAuthoredMandateKey("transcripts.clean_with_context_variable"),
    name: "Transcription Cleaner Context Variable",
    transcriptVariableKey: "transcribed_text",
    contextVariableKey: "context",
  },
  {
    id: "clean_without_context",
    mandateKey: dbAuthoredMandateKey("transcripts.clean_without_context"),
    name: "Instruction Transcript Cleaner (No Context)",
    transcriptVariableKey: "transcript",
  },
];

/** Local variant key of the default cleaner (not an agent id). */
export const DEFAULT_AI_POST_PROCESS_AGENT_ID = AI_POST_PROCESS_AGENTS[0].id;
