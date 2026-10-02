/**
 * THE ONE rule for which declared variable receives a text an agent is asked
 * to work on (Clean up, Help with this…, Custom agent — every "run an agent
 * over this text" path). The text is DATA for that variable, never prose in
 * the person's own message (THE USER-INPUT LAW).
 *
 * Priority: a transcript/text-shaped name (lowercased), else the agent's only
 * declared variable. `null` = the agent declares nowhere for the text to go.
 */

/** Variable names (lowercased) that receive the input text, in priority order. */
export const TEXT_VARIABLE_NAMES = [
  "transcribed_text",
  "transcript",
  "raw_transcript",
  "raw_transcript_text",
  "transcription",
  "content",
  "text",
  "input",
  "input_text",
  "source_text",
  "raw_text",
  "document",
] as const;

export function textInputVariable<T extends { name: string }>(defs: readonly T[]): T | null {
  const byName = TEXT_VARIABLE_NAMES.map((n) => defs.find((d) => d.name.toLowerCase() === n)).find(Boolean);
  return byName ?? (defs.length === 1 ? defs[0] : null);
}
