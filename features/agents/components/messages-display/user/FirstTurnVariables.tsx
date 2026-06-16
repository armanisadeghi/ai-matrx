"use client";

/**
 * FirstTurnVariables
 *
 * Display-only strip of the variable values a conversation was launched with.
 * Rendered ONCE, on the conversation's first user message — variables fill the
 * agent's declared template a single time and never change mid-conversation, so
 * they belong to turn 1 and turn 1 only.
 *
 * Source of truth is the instance variable slice's `userValues`, which is
 * identically populated on both paths:
 *   - Live turn 1: `executeInstance` stamps the exact `payload.variables` it
 *     sends into `userValues`.
 *   - Reload: `loadConversation` stamps `cx_conversation.variables` into
 *     `userValues`.
 * So this strip renders the same lines whether the turn just happened or was
 * rehydrated from the DB — and never bakes anything into message content.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  formatVariableDisplayName,
  variableValueToDisplay,
} from "@/features/agents/utils/variable-utils";

interface FirstTurnVariablesProps {
  conversationId: string;
}

export function FirstTurnVariables({ conversationId }: FirstTurnVariablesProps) {
  const userValues = useAppSelector(selectUserVariableValues(conversationId));

  const lines = useMemo(
    () =>
      Object.entries(userValues)
        .filter(
          ([, v]) =>
            v != null &&
            v !== "" &&
            !(Array.isArray(v) && v.length === 0),
        )
        .map(([key, value]) => ({
          key,
          label: formatVariableDisplayName(key),
          value: variableValueToDisplay(value),
        }))
        .filter((l) => l.value.trim() !== ""),
    [userValues],
  );

  if (lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 pb-1.5 mb-0.5">
      {lines.map((l) => (
        <div key={l.key} className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/70">{l.label}:</span>{" "}
          {l.value}
        </div>
      ))}
    </div>
  );
}
