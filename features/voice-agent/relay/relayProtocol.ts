// features/voice-agent/relay/relayProtocol.ts
//
// Pure cue-text builders for the Voice Communication Layer. A "cue" is the
// only thing that makes the Communicator speak: a user-role conversation item
// carrying the primary agent's response (delivery) or a truthful progress
// line (narration), plus the open-question ledger. Pure functions —
// unit-tested in __tests__/relayProtocol.test.ts.
//
// SoR: common-docs/systems/agents/voice/STATE.md

import type { DeliveryCueOptions } from "./types";

/**
 * Cue items are injected as user-role messages so every realtime provider
 * accepts them (system items mid-session are provider-inconsistent). The
 * bracket prefix keeps them unmistakably machine cues, per the Communicator's
 * DB persona which is trained on this exact framing.
 */
export const DELIVERY_CUE_PREFIX = "[cue:deliver]";
export const NARRATION_CUE_PREFIX = "[cue:narrate]";
export const MIRROR_CUE_PREFIX = "[cue:mirror]";

export function buildDeliveryCueText(
  primaryAgentResponse: string,
  opts: DeliveryCueOptions = {},
): string {
  const pacing = opts.pacing ?? "one_at_a_time";
  const lines: string[] = [
    `${DELIVERY_CUE_PREFIX} The primary agent has replied. Deliver this to the user now, conversationally.`,
    `Pacing mode: ${pacing}`,
  ];
  if (opts.speakerRole) {
    lines.push(`Speaking role: ${opts.speakerRole}`);
  }
  lines.push("--- primary agent response ---", primaryAgentResponse.trim());
  if (opts.ledgerSummary && opts.ledgerSummary.trim().length > 0) {
    lines.push("--- open questions ---", opts.ledgerSummary.trim());
  }
  return lines.join("\n");
}

/**
 * THE WAIT IS MIRRORING, NOT FILLER (Arman's ruling 4, 2026-08-17).
 *
 * While the brain works, the Communicator reflects back what it understood
 * from what the user just said — reflective listening, which is genuinely
 * useful to the speaker — instead of a canned holding line ("one moment"),
 * which is the voice equivalent of a spinner.
 *
 * The cue deliberately carries NO content: the user's utterance is already in
 * the Communicator's own realtime context, so telling it what to mirror would
 * be a second, lossier copy. This is a directive, never a script.
 */
export function buildMirrorCueText(): string {
  return (
    `${MIRROR_CUE_PREFIX} The primary agent is still working on what the user ` +
    `just said. Do NOT answer it, and do NOT guess what the answer will be. In ` +
    `one or two short sentences, reflect back what you understood from their ` +
    `last message so they know they were heard — then stop and wait for the ` +
    `answer.`
  );
}

export function buildNarrationCueText(narration: string): string {
  // Status-neutral preamble: narration covers waiting AND failure/settled-
  // without-answer states, so it must never assert "still working".
  return (
    `${NARRATION_CUE_PREFIX} A status update from the system — the user has NOT ` +
    `received an answer yet. Say ONE short, truthful line reflecting this status; ` +
    `do not answer their question yourself.\n` +
    `Status: ${narration.trim()}`
  );
}
