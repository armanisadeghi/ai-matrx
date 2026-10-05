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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "../../../../../store/hooks";
import { selectInstanceOverrideState } from "../../../../redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  resetOverride,
  setOverrides,
} from "../../../../redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { useModelFull } from "@ai-matrx/chat/host/ui-slots";
import { resolveModelControls } from "../../../../hooks/useModelControls";
import {
  ComposerMenuDivider,
  ComposerMenuLabel,
  ComposerMenuRow,
} from "./ComposerMenu";
import { composerPillClass } from "./composer-chip";
import type { ComposerSize } from "./composer-types";
import { REASONING_EFFORT_OPTIONS } from "@ai-matrx/agents/generated/llm-enums";

type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];

/** The model's control lists plain strings; only the canonical tiers reach the wire. */
function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORT_OPTIONS as readonly string[]).includes(value);
}

function effortWord(value: string): string {
  if (value === "xhigh") return "Extra high";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The conversation's effort state — null when its model exposes no
 * `reasoning_effort`. One reader for the pill and for the agent menu's
 * Effort row (a narrow composer folds Effort in there).
 */
export function useComposerEffort(conversationId: string, modelId: string | null) {
  const dispatch = useAppDispatch();
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
  const choose = (value: ReasoningEffort | null) => {
    if (value === null) {
      dispatch(resetOverride({ conversationId, key: "reasoning_effort" }));
      return;
    }
    dispatch(setOverrides({ conversationId, changes: { reasoning_effort: value } }));
  };
  return { values, overridden, agentOwn, word: overridden ? effortWord(overridden) : "Auto", choose };
}

export type ComposerEffortState = NonNullable<ReturnType<typeof useComposerEffort>>;

/** Auto · the model's effort words — the pill's menu and the agent menu's Effort panel. */
export function ComposerEffortRows({ effort, onChosen }: { effort: ComposerEffortState; onChosen?: () => void }) {
  return (
    <>
      <ComposerMenuLabel>Effort</ComposerMenuLabel>
      <ComposerMenuRow
        label="Auto"
        description={effort.agentOwn ? `Agent Default: ${effortWord(effort.agentOwn)}` : "The agent's default"}
        checked={!effort.overridden}
        onClick={() => {
          onChosen?.();
          effort.choose(null);
        }}
      />
      <ComposerMenuDivider />
      {effort.values.map((value) => (
        <ComposerMenuRow
          key={value}
          label={effortWord(value)}
          checked={value === effort.overridden}
          onClick={() => {
            onChosen?.();
            effort.choose(value);
          }}
        />
      ))}
    </>
  );
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
  const [open, setOpen] = useState(false);
  const effort = useComposerEffort(conversationId, modelId);
  if (!effort) return null;
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={composerPillClass(size, open)}
          aria-label="Effort"
          title="How hard the model thinks"
        >
          <span className={effort.overridden ? "truncate font-medium text-foreground" : "truncate"}>{effort.word}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — a short list of the model's own effort words */
        side={menuSide}
        align="end"
        sideOffset={8}
        className="w-56 p-1"
      >
        <ComposerEffortRows effort={effort} onChosen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
