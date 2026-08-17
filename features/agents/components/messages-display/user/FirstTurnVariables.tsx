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
 *
 * WHAT IS SHOWN is decided by `buildVariableDisplayLines`, not here: a value a
 * SURFACE wired on the user's behalf (`rulebook_id`) is never printed as a raw
 * id. It becomes a real door with the record's human name, or it is dropped.
 * That rule is shared with the text-only surfaces deliberately — hiding the
 * input panel never suppressed this strip, and a per-surface flag would have to
 * be remembered by every launcher forever.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";

interface FirstTurnVariablesProps {
  conversationId: string;
}

export function FirstTurnVariables({
  conversationId,
}: FirstTurnVariablesProps) {
  const userValues = useAppSelector(selectUserVariableValues(conversationId));

  const lines = buildVariableDisplayLines(userValues);

  // Resolve the human name for every wired record, so the door reads
  // "Rulebook: Chronic Care Intake" and never a UUID fragment. `EntityRef`
  // falls back to a truncated id when it gets no name — which is still an id
  // the Expert cannot read, so the name is not optional here.
  const refs = lines.flatMap((l) => (l.entity ? [l.entity] : []));
  const { titleFor } = useEntityTitles(refs);

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
            <EntityRef
              token={l.entity.token}
              id={l.entity.id}
              name={titleFor(l.entity)}
              // The strip lives inside a conversation the user is mid-way
              // through — navigating in place would cost them the interview.
              openInNewTab
            />
          ) : (
            l.text
          )}
        </div>
      ))}
    </div>
  );
}
