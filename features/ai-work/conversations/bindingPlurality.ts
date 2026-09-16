// features/ai-work/conversations/bindingPlurality.ts
//
// WHICH BINDING ACTUALLY DELIVERED — the question every screen over a
// multi-binding conversation has to answer before it says a word.
//
// A conversation can carry SEVERAL `chat.coding_session` rows (lane XT-05's
// `handoff`), and they are not the same KIND of row:
//
//   a claimed binding  — a real provider session. It mirrors turns, it can hold
//                        artifacts, and its `last_seen_at` is a delivery.
//   an unclaimed offer — `provider_session_id` starts with `matrx-handoff:`.
//                        No provider session exists yet. It has delivered
//                        NOTHING, EVER, and no `last_seen_at` it carries is a
//                        delivery claim.
//
// The bug this module exists to make impossible (verifier V-XT-5 § A5): the
// bridge stamped a brand-new offer with `last_seen_at = created_at`, so a
// naive `max(last_seen_at)` made the one row that had never delivered anything
// the "most recent delivery" — and the panel badged it and described its fields
// as the most recent delivery's. A screen is absent or honest.
//
// `last_seen_at` is `string | null`: the server half of XT-FIX-5 makes the
// column nullable and writes `null` on an unclaimed offer. Every reader here
// takes the nullable shape, so nothing breaks when the generated types catch
// up, and an unparseable stamp is treated as "no delivery to order by" rather
// than silently sorting as epoch or NaN.

import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import { isUnclaimedOffer } from "./handoffBinding";

/** The only two fields deciding whether a binding has delivered. */
export interface DeliveryFacts {
  provider_session_id: string | null;
  last_seen_at: string | null;
}

/** An offer nobody claimed. Stated once, here, for readers that only need this. */
export function isOffer(binding: DeliveryFacts): boolean {
  return isUnclaimedOffer(binding.provider_session_id);
}

/**
 * When this binding last delivered, in ms, or `null` when it has not delivered
 * at all: an unclaimed offer, a missing `last_seen_at`, or a stamp that will
 * not parse. `null` is never ordered against a real delivery.
 */
export function deliveredAtMs(binding: DeliveryFacts): number | null {
  if (isOffer(binding)) return null;
  if (!binding.last_seen_at) return null;
  const ms = Date.parse(binding.last_seen_at);
  return Number.isFinite(ms) ? ms : null;
}

/** True only for a binding that has actually delivered something. */
export function hasDelivered(binding: DeliveryFacts): boolean {
  return deliveredAtMs(binding) !== null;
}

/**
 * The binding that delivered most recently, considering ONLY bindings that
 * have delivered. `null` when none has — including the real case where every
 * binding on a conversation is an unclaimed offer, which callers must state
 * plainly instead of picking a row.
 */
export function mostRecentlyDelivered<T extends DeliveryFacts>(
  bindings: readonly T[],
): T | null {
  let best: T | null = null;
  let bestMs = -Infinity;
  for (const binding of bindings) {
    const ms = deliveredAtMs(binding);
    if (ms === null) continue;
    if (best === null || ms > bestMs) {
      best = binding;
      bestMs = ms;
    }
  }
  return best;
}

/** A conversation that has bindings, but not one that has ever delivered. */
export function hasBindingsButNoDelivery(
  bindings: readonly DeliveryFacts[],
): boolean {
  return bindings.length > 0 && mostRecentlyDelivered(bindings) === null;
}

export const NO_DELIVERY_FROM_ANY_TOOL =
  "No tool has delivered on this conversation yet. Every binding above is a handoff offer that no provider session has claimed, so there is no delivery to describe.";

/**
 * A binding's "last delivery", honestly. An offer gets a sentence saying it has
 * delivered nothing — never a blank cell, and never the creation stamp dressed
 * up as a delivery.
 */
export function lastDeliveryLabel(binding: DeliveryFacts): {
  text: string;
  delivered: boolean;
} {
  if (isOffer(binding)) {
    return {
      text: "Nothing delivered yet — this handoff is waiting to be claimed",
      delivered: false,
    };
  }
  if (deliveredAtMs(binding) === null) {
    return {
      text: "Nothing delivered yet — no delivery has been recorded for this binding",
      delivered: false,
    };
  }
  return {
    text: formatSessionTimestamp(binding.last_seen_at as string),
    delivered: true,
  };
}

/**
 * The newest delivery across a set of bindings, as its own ISO string, or
 * `null` when nothing in the set has delivered. Readers that used to take the
 * FIRST row of a `last_seen_at desc` list must use this: Postgres orders NULLs
 * first on a descending sort, so once an unclaimed offer carries
 * `last_seen_at = null` the first row is the one row that never delivered —
 * and "no delivery, ever" is the capture-gap alarm's loudest verdict.
 */
export function newestDeliveryAt(
  bindings: readonly DeliveryFacts[],
): string | null {
  return mostRecentlyDelivered(bindings)?.last_seen_at ?? null;
}

/**
 * Every real delivery timestamp in the set, offers and blanks dropped. Feeds
 * quiet-period calibration, which must not measure a gap to a delivery that
 * never happened.
 */
export function deliveryHistory(
  bindings: readonly DeliveryFacts[],
): string[] {
  return bindings
    .filter((binding) => deliveredAtMs(binding) !== null)
    .map((binding) => binding.last_seen_at as string);
}

/** One claimed provider session whose artifacts are reachable. */
export interface ArtifactSessionRef {
  provider: string;
  providerSessionId: string;
}

/**
 * Every claimed binding's provider session, in the order given. Artifacts are
 * keyed by `metadata.cli_session_id`, so a screen that keeps ONE session id
 * makes every other tool's artifacts structurally invisible (verifier V-XT-5
 * § A7). An unclaimed offer has no provider session and therefore contributes
 * no artifacts and is never offered as a tool.
 */
export function artifactSessions(
  bindings: readonly { provider: string; provider_session_id: string | null }[],
): ArtifactSessionRef[] {
  const seen = new Set<string>();
  const sessions: ArtifactSessionRef[] = [];
  for (const binding of bindings) {
    const id = binding.provider_session_id;
    if (!id || isUnclaimedOffer(id) || seen.has(id)) continue;
    seen.add(id);
    sessions.push({ provider: binding.provider, providerSessionId: id });
  }
  return sessions;
}
