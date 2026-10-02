/**
 * Zod validators for Scribe tool arguments — the RUNTIME gate the dispatcher
 * runs before a handler. MUST stay in lockstep with the hand-written JSON
 * Schemas in `tool-defs.ts` (what the model sees).
 */

import { z } from "zod";

export const scribePlayAudioArgsSchema = z.object({
  /** Start of the clip, seconds from session start (paused time excluded). */
  start_seconds: z.number().nonnegative(),
  /** Optional end of the clip — the player auto-pauses here. */
  end_seconds: z.number().nonnegative().optional(),
});

export type ScribePlayAudioArgs = z.infer<typeof scribePlayAudioArgsSchema>;
