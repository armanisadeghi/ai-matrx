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

import type { AppThunk } from "@host/lib/redux/store";
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
}): AppThunk {
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
export function resetModelChoice(conversationId: string): AppThunk {
  return (dispatch) => {
    dispatch(resetOverride({ conversationId, key: "model" }));
    dispatch(resetOverride({ conversationId, key: OFFERING_KEY }));
  };
}
