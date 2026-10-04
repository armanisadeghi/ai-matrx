/**
 * THE effective class (offering) of a conversation's model, and the class it
 * starts from — one rule for every pill, picker and "model changed" check.
 *
 *   explicit removal      → no class (the model's preferred class runs)
 *   override pin          → that class
 *   starting (base) pin   → that class
 *   on the agent's model  → the agent's own pin (settings.offering_id), which
 *                           the server applies whenever the run's model is the
 *                           agent's own — even when the instance was minted
 *                           before the agent's settings loaded, or the builder
 *                           runs the live draft with an empty base.
 */
import { useAppSelector } from "../../../../store/hooks";
import { selectAgentIdFromInstance } from "../conversations/conversations.selectors";
import {
  selectAgentModelId,
  selectAgentOfferingPin,
} from "../../agent-definition/selectors";
import { selectInstanceOverrideState } from "./instance-model-overrides.selectors";

const asPin = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;

export type ClassPins = {
  effectivePin: string | undefined;
  basePin: string | undefined;
};

/** The pure rule behind `useEffectiveClassPin` (see the file header). */
export function deriveClassPins(
  overrideState:
    | {
        baseSettings?: { model?: unknown; offering_id?: unknown } | null;
        overrides?: { model?: unknown; offering_id?: unknown } | null;
        removals?: readonly string[] | null;
      }
    | null
    | undefined,
  agentModelId: string | null | undefined,
  agentPin: string | null | undefined,
): ClassPins {
  const base = overrideState?.baseSettings;
  const baseModel = asPin(base?.model) ?? agentModelId ?? undefined;
  const basePin =
    asPin(base?.offering_id) ??
    (baseModel && baseModel === agentModelId ? asPin(agentPin) : undefined);

  if (overrideState?.removals?.includes("offering_id")) {
    return { effectivePin: undefined, basePin };
  }
  const overridePin = asPin(overrideState?.overrides?.offering_id);
  if (overridePin) return { effectivePin: overridePin, basePin };
  const effectiveModel = asPin(overrideState?.overrides?.model) ?? baseModel;
  return {
    effectivePin: effectiveModel === baseModel ? basePin : undefined,
    basePin,
  };
}

export function useEffectiveClassPin(conversationId: string): ClassPins {
  const overrideState = useAppSelector(selectInstanceOverrideState(conversationId));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId)) ?? null;
  const agentModelId = useAppSelector((s) => (agentId ? selectAgentModelId(s, agentId) : null));
  const agentPin = useAppSelector((s) =>
    agentId ? asPin(selectAgentOfferingPin(s, agentId)) : undefined,
  );
  return deriveClassPins(overrideState, agentModelId, agentPin);
}
