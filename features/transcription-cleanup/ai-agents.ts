/**
 * Default agents for the Transcription Cleanup page.
 *
 * The page accepts ANY agent (picked via AgentListDropdown); input/context
 * resolution is generic — see `hooks/useAiPostProcess.ts`. These ids are only
 * the out-of-the-box defaults: system-owned agents every authenticated user
 * can invoke.
 */

/** Default Clean agent — "Transcription Cleaner Context Slots". */
export const DEFAULT_CLEAN_AGENT_ID = "9cae3831-9895-4ddb-97cd-2ded3d3f443b";

/** Friendly names for the system cleaners (shown before redux has the name). */
export const SYSTEM_AGENT_NAMES: Record<string, string> = {
  "9cae3831-9895-4ddb-97cd-2ded3d3f443b": "Transcription Cleaner",
  "5840be74-58e9-41c7-ae26-7deced75a5e0": "Transcription Cleaner (variable)",
  "c604338e-9bff-42db-a593-fe00cd4908fb": "Instruction Transcript Cleaner",
};
