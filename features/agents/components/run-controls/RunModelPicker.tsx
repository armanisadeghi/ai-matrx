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

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  setOverrides,
  resetOverride,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";

/**
 * Shared genuine-delta model-override state. `model` is never removed, so
 * effective = override ?? base; picking the base model CLEARS the override.
 */
function useModelOverride(conversationId: string) {
  const dispatch = useAppDispatch();
  // Read the (stable-ref) override state and derive everything locally — avoids
  // the new-object selectCurrentSettings, which would re-render on every store
  // dispatch.
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );

  const baseModel = overrideState?.baseSettings?.model ?? null;
  const overrideModel = overrideState?.overrides?.model ?? null;
  const effectiveModel = overrideModel ?? baseModel;
  const isOverridden = effectiveModel !== baseModel;

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

  return {
    baseModel,
    effectiveModel,
    isOverridden,
    handleChange,
    handleReset,
  };
}

/**
 * QuickRunModelSelect — single-row compact variant for toolbar/quick rows
 * (the `+` attach popover). It deliberately uses the same canonical
 * ModelListDropdown as `/agents/[id]/build`; only the write target differs.
 * agent default pinned first; reset icon appears only when overridden.
 */
export function QuickRunModelSelect({
  conversationId,
  className,
}: {
  conversationId: string;
  className?: string;
}) {
  const {
    baseModel,
    effectiveModel,
    isOverridden,
    handleChange,
    handleReset,
  } = useModelOverride(conversationId);

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <ModelListDropdown
        value={effectiveModel ?? baseModel ?? null}
        onValueChange={handleChange}
        inputModalities={[]}
        outputModalities={["text"]}
      />
      {isOverridden && (
        <button
          type="button"
          onClick={handleReset}
          title="Reset to agent default"
          aria-label="Reset model to agent default"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function RunModelPicker({ conversationId }: { conversationId: string }) {
  const {
    baseModel,
    effectiveModel,
    isOverridden,
    handleChange,
    handleReset,
  } = useModelOverride(conversationId);

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
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

      <ModelListDropdown
        value={effectiveModel ?? baseModel ?? null}
        onValueChange={handleChange}
        inputModalities={[]}
        outputModalities={["text"]}
      />
    </div>
  );
}
