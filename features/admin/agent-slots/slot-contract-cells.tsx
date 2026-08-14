"use client";

/**
 * Contract-driven Inputs / Output cells, shared by the console table and the
 * drawer's facts panel.
 *
 * THE PROMISE RULE (Arman, 2026-08-14): a slot's I/O display renders the
 * CONTRACT — the required variables in, and the output promise out (a
 * registered kind, or the required output keys). "text" with no explanation
 * is banned: an unspecified output is a visible amber gap, never a neutral
 * value, because nobody trusts a slot with "text" — it's a blog post, a
 * verdict, a classification IN text, and the slot should say which.
 */

import { Badge } from "@/components/ui/badge";
import type { SlotRow } from "./slot-health";

const KIND_REGISTRY_BASE = "/administration/utilities/kind-registry";

/** Required variables as chips, plus the ever-present free-text channel. */
export function SlotInputsCell({
  row,
  maxChips = 4,
}: {
  row: SlotRow;
  maxChips?: number;
}) {
  const variables = row.requiredVariables;
  if (variables.length === 0) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="This slot declares no required variables — it runs on the user's message alone."
      >
        user text only
      </span>
    );
  }
  const shown = variables.slice(0, maxChips);
  const hidden = variables.length - shown.length;
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      title={`Required variables: ${variables.join(", ")} — plus optional user text on every run.`}
    >
      {shown.map((name) => (
        <Badge
          key={name}
          variant="outline"
          className="h-5 px-1.5 font-mono text-[10px]"
        >
          {name}
        </Badge>
      ))}
      {hidden > 0 && (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      )}
      <span className="text-[10px] text-muted-foreground">+ user text</span>
    </div>
  );
}

/** The output promise: a registered kind (a door), the required output keys,
 * or a loud amber gap — never a bare "text". */
export function SlotOutputCell({
  row,
  maxChips = 4,
}: {
  row: SlotRow;
  maxChips?: number;
}) {
  const kind = row.slot.output_kind;
  if (kind) {
    return (
      <a
        href={`${KIND_REGISTRY_BASE}/${kind}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Registered content kind "${kind}" — open its definition`}
      >
        <Badge
          variant="secondary"
          className="h-5 px-1.5 font-mono text-[10px] hover:bg-accent"
        >
          {kind}
        </Badge>
      </a>
    );
  }
  const keys = row.requiredOutputKeys;
  if (keys.length > 0) {
    const shown = keys.slice(0, maxChips);
    const hidden = keys.length - shown.length;
    return (
      <div
        className="flex flex-wrap items-center gap-1"
        title={`No registered kind, but the contract requires these output keys: ${keys.join(", ")}.`}
      >
        {shown.map((key) => (
          <Badge
            key={key}
            variant="outline"
            className="h-5 px-1.5 font-mono text-[10px]"
          >
            {key}
          </Badge>
        ))}
        {hidden > 0 && (
          <span className="text-[10px] text-muted-foreground">+{hidden}</span>
        )}
      </div>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-5 px-1.5 text-[10px] text-amber-600 border-amber-500/40 bg-amber-500/10"
      title="This slot promises nothing about its output — no registered kind and no required output keys. That is a contract gap: consumers can't know what they'll get."
    >
      unspecified
    </Badge>
  );
}
