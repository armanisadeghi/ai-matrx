"use client";

/**
 * RunModelPicker — per-conversation MODEL override for the Smart Input.
 *
 * Layer 1 of the Smart Input override UX (the model is the common, simple
 * change; deeper settings live behind the advanced disclosure). Writes to the
 * instance override layer (`config_overrides.model`), scoped to THIS
 * conversation — it never edits the stored agent.
 *
 * Genuine-delta by construction: picking the agent's own model clears the
 * override (resetOverride) rather than storing a base-equal value. The API
 * selector re-diffs as a backstop, but doing it here keeps the "overridden"
 * indicator honest too.
 */

import { RotateCcw, Info } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import { selectModelOptions } from "@/features/ai-models/redux/modelRegistrySlice";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  setOverrides,
  resetOverride,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";

export function RunModelPicker({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  // Read the (stable-ref) override state and derive everything locally — avoids
  // the new-object selectCurrentSettings, which would re-render on every store
  // dispatch. `model` is never removed, so effective = override ?? base.
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const options = useAppSelector(selectModelOptions);

  const baseModel = overrideState?.baseSettings?.model ?? null;
  const overrideModel = overrideState?.overrides?.model ?? null;
  const effectiveModel = overrideModel ?? baseModel;
  const isOverridden = effectiveModel !== baseModel;

  const baseModelLabel =
    options.find((o) => o.value === baseModel)?.label ?? null;

  const handleChange = (modelId: string) => {
    // Picking the agent's own model is not an override — clear it.
    if (baseModel && modelId === baseModel) {
      dispatch(resetOverride({ conversationId, key: "model" }));
      return;
    }
    dispatch(setOverrides({ conversationId, changes: { model: modelId } }));
  };

  const handleReset = () =>
    dispatch(resetOverride({ conversationId, key: "model" }));

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Model</span>
        {isOverridden && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to agent default
          </button>
        )}
      </div>

      <SmartModelSelect
        value={effectiveModel ?? baseModel ?? null}
        onValueChange={handleChange}
        className="w-full"
      />

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {isOverridden ? (
          <span>
            Overriding{baseModelLabel ? ` the agent's ${baseModelLabel}` : " the agent's model"} for
            this conversation only.
          </span>
        ) : (
          <span>
            Using the agent&apos;s model. Pick another to override it for this
            conversation only — the agent itself is unchanged.
          </span>
        )}
      </p>
    </div>
  );
}
