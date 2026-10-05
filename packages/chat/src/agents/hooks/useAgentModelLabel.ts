"use client";

import { useAppSelector } from "../../store/hooks";
import {
  selectAgentModelId,
  selectAgentOfferingPin,
} from "../redux/agent-definition/selectors";
import {
  selectModelLabelById,
  selectModelLabelWithClass,
} from "../model-registry/modelRegistrySlice";
import { useModelClassLabels } from "../../host/model-class";

/**
 * The model an agent uses, as every agent card / header / copy names it:
 * "Qwen3.8 27B · Matrx Lightning" when the model has several classes.
 *
 * `offeringId` is the agent's class pin: a string, null (no pin — the
 * preferred class runs) or undefined when the agent's settings are not loaded
 * (a list record) — then the class is unknown and the model name stands alone.
 */
export function useAgentModelLabel(agentId: string | null | undefined): {
  modelId: string | null;
  offeringId: string | null | undefined;
  label: string | undefined;
} {
  useModelClassLabels();
  const modelId = useAppSelector((state) =>
    agentId ? selectAgentModelId(state, agentId) : null,
  );
  const offeringId = useAppSelector((state) =>
    agentId ? selectAgentOfferingPin(state, agentId) : undefined,
  );
  const label = useAppSelector((state) =>
    offeringId === undefined
      ? selectModelLabelById(state, modelId)
      : selectModelLabelWithClass(state, modelId, offeringId),
  );
  return { modelId, offeringId, label };
}
