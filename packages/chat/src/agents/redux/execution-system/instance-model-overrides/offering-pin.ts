/**
 * The CLASS pin of a model override — `offering_id` beside `model`.
 *
 * A model offered in several classes (Matrx Fast, Matrx Lightning, ...) is
 * several products. The picker hands back the chosen class's `ai.offering`
 * uuid, and it travels in the SAME override layer as `model`, so it reaches
 * the wire through `selectSettingsOverridesForApi` → `config_overrides`
 * (LLMParams.offering_id; the server routes exactly that offering). With no
 * pin the server runs the preferred class.
 *
 * Genuine-delta like `model`: choosing the agent's own pin clears the
 * override; choosing "no pin" (undefined) clears it when the agent has none,
 * and is an explicit removal when the agent pinned one (the layer's own
 * "the API must not receive this key" state — never a stored null/"").
 */

import type { ChatThunk } from "../../../../store/root-state";
import type { InstanceModelOverrideState } from "../../../types/instance.types";
import {
  markRemoved,
  resetOverride,
  seedOverrides,
  setOverrides,
} from "./instance-model-overrides.slice";

const OFFERING_KEY = "offering_id";

const asPin = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** The class this run will use: override ?? agent's own, unless removed. */
export function effectiveOfferingPin(
  entry: InstanceModelOverrideState | undefined,
): string | undefined {
  if (!entry || entry.removals.includes(OFFERING_KEY)) return undefined;
  return asPin(entry.overrides.offering_id) ?? asPin(entry.baseSettings.offering_id);
}

/** Write the picker's class choice for one conversation's override layer. */
export function setOfferingPin({
  conversationId,
  offeringId,
  seeded = false,
}: {
  conversationId: string;
  offeringId: string | undefined;
  /** A launch default (the person's Custom default), not a pick for this chat. */
  seeded?: boolean;
}): ChatThunk {
  return (dispatch, getState) => {
    const entry =
      getState().instanceModelOverrides.byConversationId[conversationId];
    if (!entry) return;
    const basePin = asPin(entry.baseSettings.offering_id);
    if (offeringId === basePin) {
      dispatch(resetOverride({ conversationId, key: OFFERING_KEY }));
      return;
    }
    if (offeringId === undefined) {
      dispatch(markRemoved({ conversationId, key: OFFERING_KEY }));
      return;
    }
    const write = seeded ? seedOverrides : setOverrides;
    dispatch(write({ conversationId, changes: { offering_id: offeringId } }));
  };
}

/** Back to the agent's own model AND its own class — the two move together. */
export function resetModelChoice(conversationId: string): ChatThunk {
  return (dispatch) => {
    dispatch(resetOverride({ conversationId, key: "model" }));
    dispatch(resetOverride({ conversationId, key: OFFERING_KEY }));
  };
}

/**
 * The override keys an agent switch carries, with the CLASS bound to its MODEL.
 *
 * A class (`offering_id`) is an offering OF one model. Carried alone — e.g. a
 * class pinned from a Service chip on a default chat whose model is a SEEDED
 * launch default (which never crosses the switch) — it lands beside the target
 * agent's own model and the run raises. So:
 *   - the model travels → its class travels with it: the source's effective
 *     pin, or — when the target has a pin of its own (base or override) — an
 *     explicit removal (`null`), so the target's class (an offering of the
 *     target's model) never rides the carried model;
 *   - the model does not travel → no class key travels either (no pin, no
 *     removal); the target keeps its own model AND its own class.
 * `carried` uses the replaceOverrides document shape (`null` = removal).
 */
export function classOnlyBesideItsModel(
  carried: Record<string, unknown>,
  source: InstanceModelOverrideState,
  target: InstanceModelOverrideState | undefined,
): Record<string, unknown> {
  const next = { ...carried };
  delete next[OFFERING_KEY];
  if (typeof next.model === "string" && next.model !== "") {
    const pin = effectiveOfferingPin(source);
    if (pin) next[OFFERING_KEY] = pin;
    else if (effectiveOfferingPin(target)) next[OFFERING_KEY] = null;
  }
  return next;
}
