/**
 * AI post-processing agents available in the TranscriptionCleanup pad.
 *
 * Each agent declares the variable key that should receive the transcribed
 * text and, optionally, either a context slot OR a context variable that
 * should receive free-form user context. Variable and slot keys differ per
 * agent — the pad wires them up by name when it launches the agent.
 *
 * These IDs are system-owned agents — every authenticated user can invoke
 * them. Users who want custom variations should add them via preferences
 * (see Phase D in the transcription plan).
 */

export interface AiPostProcessAgent {
  id: string;
  name: string;
  /** Variable key that receives the full transcribed text. */
  transcriptVariableKey: string;
  /** Optional context slot key for user-typed context (slot-based agents). */
  contextSlotKey?: string;
  /** Optional variable key for user-typed context (variable-based agents). */
  contextVariableKey?: string;
}

export const AI_POST_PROCESS_AGENTS: AiPostProcessAgent[] = [
  {
    id: "9cae3831-9895-4ddb-97cd-2ded3d3f443b",
    name: "Transcription Cleaner (Context Slots)",
    transcriptVariableKey: "transcribed_text",
    contextSlotKey: "transcription_user_context",
  },
  {
    id: "5840be74-58e9-41c7-ae26-7deced75a5e0",
    name: "Transcription Cleaner (Context Variable)",
    transcriptVariableKey: "transcribed_text",
    contextVariableKey: "context",
  },
  {
    id: "c604338e-9bff-42db-a593-fe00cd4908fb",
    name: "Instruction Transcript Cleaner (No Context)",
    transcriptVariableKey: "transcript",
  },
];

export const DEFAULT_AI_POST_PROCESS_AGENT_ID = AI_POST_PROCESS_AGENTS[0].id;
