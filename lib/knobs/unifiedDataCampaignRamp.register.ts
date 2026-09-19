// lib/knobs/unifiedDataCampaignRamp.register.ts
//
// THE CONSUMER IDS, and the one rule that turns an id into a knob key.
//
// WHY ITS OWN FILE, like its sibling `unifiedDataCampaign.register.ts`: the
// entry-point guard and the id-agreement guard both read this list and must run
// in a bare checkout with no database and no environment, so this module
// imports nothing and has no side effects.
//
// THE DATABASE IS THE REGISTER. `campaign_watch.ramp_consumer` says what a
// consumer IS — its label, its owning lane, whether its code has landed, which
// record types its reads travel over, whether it can be rolled back. This file
// holds only the IDS, so TypeScript can name one. The two are kept level by
// `pnpm check:campaign-ramp-ids`, which reads both and fails on any difference
// in either direction.

/** The eight consumers, in switch-checklist §11.12's order. */
export const RAMP_CONSUMER_IDS = [
  "grid",
  "saved_ai_outputs",
  "scopes",
  "education",
  "checkout",
  "extension",
  "chat_seeding",
  "retirement",
] as const;

export type UnifiedDataConsumerId = (typeof RAMP_CONSUMER_IDS)[number];

/**
 * The ONE place an id becomes a knob key. Keep it a pure function of the id:
 * the migration that seeds the rows spells them the same way, and a lookup
 * table here would be a second list to forget.
 */
export function rampKnobKey(consumerId: UnifiedDataConsumerId | string): string {
  return `consumer_${consumerId}_enabled`;
}

/** The feature every ramp knob lives under. */
export const RAMP_KNOB_FEATURE = "custom";
