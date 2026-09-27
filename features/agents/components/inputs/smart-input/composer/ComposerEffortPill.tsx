"use client";

/**
 * Effort (brief §9, Amendment 1 A1): Work and Advanced only, and only when the
 * conversation's model exposes `reasoning_effort` (its registry `controls`).
 * The values are the model's own; picking one writes the per-conversation
 * override layer (`config_overrides.reasoning_effort`) — the same write the
 * run-settings Overrides panel makes. "Agent default" clears it.
 */

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  resetOverride,
  setOverrides,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { resolveModelControls } from "@/features/agents/hooks/useModelControls";
import { ComposerMenuDivider, ComposerMenuLabel, ComposerMenuRow } from "./ComposerMenu";
import { composerPillClass } from "./ComposerAgentPill";
import type { ComposerSize } from "./composer-types";
import { REASONING_EFFORT_OPTIONS } from "@/types/python-generated/llm-enums";

type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];

/** The model's control lists plain strings; only the canonical tiers reach the wire. */
function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORT_OPTIONS as readonly string[]).includes(value);
}

function effortWord(value: string): string {
  if (value === "xhigh") return "Extra high";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The pill sits beside the approval pill, which reads "Auto" — a bare "Auto" here would say the same word twice. */
function effortPillWord(value: string): string {
  return value === "auto" ? "Auto effort" : effortWord(value);
}

export function ComposerEffortPill({
  conversationId,
  modelId,
  size,
  menuSide,
}: {
  conversationId: string;
  modelId: string | null;
  size: ComposerSize;
  menuSide: "top" | "bottom";
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const model = useAppSelector((state) => (modelId ? selectModelById(state, modelId) : undefined));
  const overrideState = useAppSelector(selectInstanceOverrideState(conversationId));

  if (!model || !modelId) return null;
  const control = resolveModelControls([model], modelId).normalizedControls?.reasoning_effort;
  const values = (control?.enum ?? []).filter(isReasoningEffort);
  if (values.length === 0) return null;

  const overridden = overrideState?.overrides?.reasoning_effort;
  const base = overrideState?.baseSettings?.reasoning_effort ?? control?.default;
  const current = typeof overridden === "string" ? overridden : typeof base === "string" ? base : null;

  const choose = (value: ReasoningEffort | null) => {
    setOpen(false);
    if (value === null) {
      dispatch(resetOverride({ conversationId, key: "reasoning_effort" }));
      return;
    }
    dispatch(setOverrides({ conversationId, changes: { reasoning_effort: value } }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button type="button" className={composerPillClass(size, open)} aria-label="Effort" title="How hard the model thinks">
          <span className="truncate">{current ? effortPillWord(current) : "Effort"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — a short list of the model's own effort words */
        side={menuSide}
        align="end"
        sideOffset={8}
        className="w-56 p-1"
      >
        <ComposerMenuLabel>Effort</ComposerMenuLabel>
        {values.map((value) => (
          <ComposerMenuRow
            key={value}
            label={effortWord(value)}
            checked={value === current}
            onClick={() => choose(value)}
          />
        ))}
        <ComposerMenuDivider />
        <button
          type="button"
          onClick={() => choose(null)}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground hover:bg-accent"
        >
          <span className="min-w-0 flex-1 truncate text-left">Agent default</span>
          {typeof overridden !== "string" ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
        </button>
      </PopoverContent>
    </Popover>
  );
}
