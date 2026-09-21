// lib/knobs/unifiedDataCampaignRamp.ts
//
// THE RAMP — the one place a consumer of the unified data store asks whether it
// may read the unified store yet, for this organization and this person.
//
// WHY THIS IS NOT `unifiedDataCampaign.ts`. That module is THE SWITCH: does
// this ORGANIZATION keep its data in the unified record store at all
// (`custom/system_enabled`, set once on the unified data ramp screen)? This
// module is the RAMP: CUT-3's law that existing data moves CONSUMER BY CONSUMER
// and that Test 1 gates each consumer's switch. Those are different questions
// and they compose:
//
//     a consumer reads the unified store  ⟺  the organization is on the store
//                                          ∧  that consumer's knob resolves true
//                                             for this organization / person
//
// The AND is the point. Turning the store on does not move anybody; every
// consumer knob still resolves false, so every path keeps reading its old table
// until someone switches that one consumer for that one organization.
//
// THE LADDER IS THE PLATFORM'S OWN. Each consumer is a row in
// `platform.feature_knob` under feature `custom`, key
// `consumer_<id>_enabled`, declared `overridable_by {organization, user}` and
// resolved by `platform.knob_resolve(feature, key, organization_id, user_id)`.
// There is no second resolver, no second ladder and no new storage: the
// organization rung is the unit of the ramp (switch checklist §11.2) and the
// user rung is the per-person override the people building a consumer need
// while everyone else stays off.
//
// THE REGISTER IS IN THE DATABASE. Which consumers exist, which lane owns each
// one and whether its code has landed live in `campaign_watch.ramp_consumer` —
// one place, read by the admin screen AND by the gate, so the screen cannot
// describe a consumer the gate does not know. The ids below are the TypeScript
// spelling of that same list and nothing more; `pnpm check:campaign-ramp-ids`
// fails when the two disagree.
//
// NOT AN ENV VAR, for the same reason the kill switch is not: an environment
// variable is a value, never a toggle
// (`common-docs/policies/env-vars-are-values-not-toggles.md`).

import { UNIFIED_DATA_CAMPAIGN } from "./unifiedDataCampaign";
import {
  RAMP_CONSUMER_IDS,
  rampKnobKey,
  type UnifiedDataConsumerId,
} from "./unifiedDataCampaignRamp.register";

export { RAMP_CONSUMER_IDS, rampKnobKey };
export type { UnifiedDataConsumerId };

/** Which store a consumer's read path must use, and why, in one sentence. */
export interface ConsumerStoreDecision {
  /** `"unified"` only when BOTH halves said yes. `"legacy"` is the default. */
  store: "unified" | "legacy";
  /**
   * Plain English, always populated. A path that switched stores without being
   * able to say why is a path nobody can debug at three in the morning.
   */
  because: string;
}

const OFF_BECAUSE_KILL_SWITCH =
  "This organization does not keep its data in the unified record store, so no consumer of it reads " +
  "the unified store, whatever that consumer's own knob says. An owner or an administrator turns the " +
  "store on for the organization on the unified data ramp screen. Reading the old table.";

/**
 * THE ONE CALL every client and server read path makes.
 *
 * It asks the kill switch FIRST and stops there when it is off — which is both
 * correct and cheap, because that is the answer for every consumer on every
 * request until the campaign's switch day.
 */
export async function resolveConsumerStore(args: {
  consumerId: UnifiedDataConsumerId;
  organizationId: string | null | undefined;
  userId?: string | null;
  /** Resolves the consumer knob through `platform.knob_resolve`. */
  resolveKnob: (
    feature: string,
    key: string,
    organizationId: string,
    userId: string | null,
  ) => Promise<boolean>;
}): Promise<ConsumerStoreDecision> {
  const { consumerId, organizationId, userId = null, resolveKnob } = args;

  // THE ONE SWITCH, asked FIRST: does this organization keep its data in the
  // record store at all? Until 19 September this asked a platform-wide kill
  // switch with a per-person rung on it (lane NAV-FIX); one organization, one
  // answer, and a consumer knob only ever narrows it further.
  // 🚨 AND IT SAYS WHICH ANSWER IT GOT (lane SHARE-OUT, item 3). `enabled()` used to
  // collapse "switched off" and "the read failed" into one `false`, so `because` — which
  // is the sentence a person or an engineer reads when they ask why they are on the old
  // table — claimed the organization had not switched the store on when in fact nobody
  // could look. The store choice is identical either way (a ramp never moves anybody
  // because a read failed); only the sentence differs, and only one of them is true.
  const kill = await UNIFIED_DATA_CAMPAIGN.check(organizationId);
  if (kill.state === "unavailable") {
    return {
      store: "legacy",
      because:
        `Could not read whether organization ${organizationId ?? "(none)"} keeps its data in the ` +
        "unified record store, so this consumer stays on the old table — a ramp never moves " +
        "anybody because a read failed. This is NOT a statement that the store is switched off; " +
        `nobody could look. Remedy: retry. Cause: ${kill.cause}`,
    };
  }
  if (kill.state !== "on") {
    return { store: "legacy", because: OFF_BECAUSE_KILL_SWITCH };
  }

  if (!organizationId) {
    return {
      store: "legacy",
      because:
        "The ramp switches one organization at a time and this read carries no organization, " +
        "so there is nothing to resolve against. Reading the old table.",
    };
  }

  const key = rampKnobKey(consumerId);
  let on: boolean;
  try {
    on = await resolveKnob("custom", key, organizationId, userId);
  } catch (error) {
    // A ramp that fails OPEN moves an organization onto a different data store
    // because a knob read timed out. It fails CLOSED, loudly, with the remedy.
    return {
      store: "legacy",
      because:
        `Could not read the ramp knob "custom.${key}" for organization ${organizationId}, so this ` +
        "consumer stays on the old table — a ramp never moves anybody because a read failed. " +
        `Remedy: check that the knob row exists and platform.knob_resolve answers. Cause: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!on) {
    return {
      store: "legacy",
      because:
        `"custom.${key}" resolves false for this organization${userId ? " and person" : ""}, so ` +
        "this consumer has not been ramped yet. Reading the old table.",
    };
  }

  return {
    store: "unified",
    because:
      `The campaign's code paths are on and "custom.${key}" resolves true for this ` +
      `organization${userId ? " and person" : ""} — this consumer is ramped. Reading the unified store.`,
  };
}
