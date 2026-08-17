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
 *   - Live turn 1: `executeInstance` / `executeManualInstance` stamp the exact
 *     resolved variables they send into `userValues`.
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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";

interface FirstTurnVariablesProps {
  conversationId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A surface WIRES ids on the user's behalf (the Scout panel sends
 * `rulebook_id`); the Expert never typed one and can do nothing with one.
 * Printing it read "Rulebook id: 56d96d67-…" to a non-technical Expert mid
 * interview — the exact developer leakage this product must never show.
 *
 * So a bare UUID is never rendered as text. When its key names a known entity
 * (`rulebook_id` → `rulebook`) it becomes a real door — icon, open, peek (THE
 * DOOR LAW). When nothing can resolve it, the line is dropped: an id the user
 * can neither read nor open is noise, not information.
 */
function resolveIdVariable(
  key: string,
  value: unknown,
): { token: string; id: string } | null {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) return null;
  const base = key.replace(/_?id$/i, "").replace(/_+$/, "");
  if (!base) return null;
  const token = resolveEntityToken(base);
  return tryGetEntityInfo(token) ? { token, id: value.trim() } : null;
}

export function FirstTurnVariables({
  conversationId,
}: FirstTurnVariablesProps) {
  const userValues = useAppSelector(selectUserVariableValues(conversationId));

  const lines = useMemo(
    () =>
      Object.entries(userValues)
        // System-reserved variables (wrapped in double underscores, e.g.
        // `__agent_user_input__`) are not user-authored launch values — they
        // mirror the message body itself. Rendering them here duplicated the
        // user's text and printed a bogus "Agent User Input:" label above it.
        .filter(([key]) => !/^__.*__$/.test(key))
        .filter(
          ([, v]) =>
            v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
        )
        .map(([key, value]) => ({
          key,
          label: formatVariableDisplayName(key),
          value: variableValueToDisplay(value),
          entity: resolveIdVariable(key, value),
          isBareId:
            typeof value === "string" && UUID_RE.test(String(value).trim()),
        }))
        // A bare id that resolves to nothing openable is dropped entirely —
        // see resolveIdVariable. Everything else keeps the old rule.
        .filter((l) => (l.isBareId ? l.entity !== null : l.value.trim() !== "")),
    [userValues],
  );

  if (lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 pb-1.5 mb-0.5">
      {lines.map((l) => (
        <div
          key={l.key}
          className="text-[11px] leading-snug text-muted-foreground"
        >
          <span className="font-medium text-foreground/70">{l.label}:</span>{" "}
          {l.entity ? (
            <EntityRef token={l.entity.token} id={l.entity.id} />
          ) : (
            l.value
          )}
        </div>
      ))}
    </div>
  );
}
