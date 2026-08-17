// features/voice-agent/relay/relayProtocol.ts
//
// Pure cue-text builders for the Voice Communication Layer. A "cue" is the
// only thing that makes the Communicator speak: a user-role conversation item
// carrying the primary agent's response (delivery) or a truthful progress
// line (narration), plus the open-question ledger. Pure functions —
// unit-tested in __tests__/relayProtocol.test.ts.
//
// SoR: common-docs/systems/voice-communication-layer/FEATURE.md

import type { DeliveryCueOptions } from "./types";

/**
 * Cue items are injected as user-role messages so every realtime provider
 * accepts them (system items mid-session are provider-inconsistent). The
 * bracket prefix keeps them unmistakably machine cues, per the Communicator's
 * DB persona which is trained on this exact framing.
 */
export const DELIVERY_CUE_PREFIX = "[cue:deliver]";
export const NARRATION_CUE_PREFIX = "[cue:narrate]";

export function buildDeliveryCueText(
  primaryAgentResponse: string,
  opts: DeliveryCueOptions = {},
): string {
  const lines: string[] = [
    `${DELIVERY_CUE_PREFIX} The primary agent has replied. Deliver this to the user now, conversationally — ask at most ONE question.`,
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

export function buildNarrationCueText(narration: string): string {
  return (
    `${NARRATION_CUE_PREFIX} The primary agent is still working. Say ONE short, ` +
    `truthful line to keep the user comfortable — do not answer their question yourself.\n` +
    `Status: ${narration.trim()}`
  );
}
