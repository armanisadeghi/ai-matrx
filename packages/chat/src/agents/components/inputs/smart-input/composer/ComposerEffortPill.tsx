"use client";

/**
 * Effort (brief §9, Amendment 1 A1): Work and Advanced only, and only when the
 * conversation's model exposes `reasoning_effort` (its registry `controls`).
 *
 * THE AUTO RULE (Arman, 2026-09-28): "Auto" means DON'T TOUCH IT — no
 * `reasoning_effort` override is sent, so the agent's own setting runs. It is
 * never the literal value "auto" sent as an override (many models accept that
 * word as a setting of their own, which is a different thing). Any other
 * choice writes that exact value to the per-conversation override layer
 * (`config_overrides.reasoning_effort`) — the same write the Overrides panel
 * makes. The Auto row names the agent's own value when it has one.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  resetOverride,
  setOverrides,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { useModelFull } from "@/features/ai-models/hooks/useModels";
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
  // The FULL record carries the model's `controls`; asking for it here means the
  // pill never depends on some other screen having loaded the model first.
  const model = useModelFull(modelId);
  const overrideState = useAppSelector(selectInstanceOverrideState(conversationId));

  if (!model || !modelId) return null;
  const control = resolveModelControls([model], modelId).normalizedControls?.reasoning_effort;
  // "auto" is never offered as a value to SEND — Auto is the absence of an override.
  const values = (control?.enum ?? []).filter(isReasoningEffort).filter((value) => value !== "auto");
  if (values.length === 0) return null;

  const overriddenRaw = overrideState?.overrides?.reasoning_effort;
  const overridden = typeof overriddenRaw === "string" && overriddenRaw !== "auto" ? overriddenRaw : null;
  const base = overrideState?.baseSettings?.reasoning_effort ?? control?.default;
  const agentOwn = typeof base === "string" ? base : null;
  const pillWord = overridden ? `${effortWord(overridden)} effort` : "Auto effort";

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
          <span className={overridden ? "truncate font-medium text-foreground" : "truncate"}>{pillWord}</span>
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
        <ComposerMenuRow
          label="Auto"
          description={agentOwn ? `The agent's own setting — ${effortWord(agentOwn)}` : "The agent's own setting"}
          checked={!overridden}
          onClick={() => choose(null)}
        />
        <ComposerMenuDivider />
        {values.map((value) => (
          <ComposerMenuRow
            key={value}
            label={effortWord(value)}
            checked={value === overridden}
            onClick={() => choose(value)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
