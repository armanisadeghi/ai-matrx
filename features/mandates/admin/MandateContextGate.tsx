"use client";

/**
 * MandateContextGate — the Mandate-level half of the Context Policy kill switch.
 *
 * A Mandate may cut context off even when its Holder would accept it. This is
 * the console's control for that decision, and the one place that states the
 * combined outcome honestly.
 *
 * 🚨 A GATE MAY ONLY NARROW. The effective value is `holder OR mandate`:
 * closing the gate here shuts context off for this mandate no matter what the
 * Holder allows, and opening it CANNOT reopen context the Holder itself
 * refused. That asymmetry is the whole point, so the UI never implies the
 * switch "enables" anything — when the Holder has already closed its own
 * switch, this control says so and reads as inert rather than pretending the
 * mandate is in charge.
 *
 * This mirrors `max_inline_chars`, which already resolves as
 * `min(agent, surface)`. Context control extends the same rule from *how much*
 * to *whether at all*.
 *
 * System of record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md
 *   § "Context passes gates, and a gate may only narrow"
 */

import { useState } from "react";
import { Layers, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { updateMandateDefinition } from "./service";
import type { MandateRow } from "./mandate-health";

export function MandateContextGate({
  row,
  onSaved,
}: {
  row: MandateRow;
  /** Refetch the console so every derived cell reflects the new value. */
  onSaved?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [gateClosed, setGateClosed] = useState(row.contextGateClosed);

  const holderClosed = row.holderContextClosed;
  const effectiveClosed = holderClosed || gateClosed;

  async function handleChange(allow: boolean) {
    const next = !allow;
    const previous = gateClosed;
    setGateClosed(next);
    setSaving(true);
    try {
      await updateMandateDefinition(row.id, { auto_context_disabled: next });
      onSaved?.();
    } catch (error) {
      setGateClosed(previous);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the context gate.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`mandate-context-gate-${row.id}`}
        className={cn(
          "flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-2.5 py-2",
          holderClosed ? "cursor-default" : "cursor-pointer",
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {effectiveClosed ? (
            <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">
              Allow automated context injection
            </span>
            <span
              className={cn(
                "block text-[11px] leading-tight",
                effectiveClosed
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground",
              )}
            >
              {holderClosed && gateClosed
                ? "Off — closed by this Mandate, and the Holder closes it too. Only the Holder's declared context policies deliver."
                : holderClosed
                  ? `Off — the Holder (${row.agentName}) refuses automatic context. This Mandate cannot reopen it; a gate may only narrow.`
                  : gateClosed
                    ? "Off — this Mandate cuts context off even though its Holder would accept it. Only the Holder's declared context policies deliver."
                    : "On — the Holder decides. Scope values and Surface values reach it under its own context policies."}
            </span>
          </span>
        </span>
        <Switch
          id={`mandate-context-gate-${row.id}`}
          checked={!gateClosed}
          disabled={saving || holderClosed}
          onCheckedChange={handleChange}
          className="shrink-0"
        />
      </label>
      {row.requiredContextPolicyKeys.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          This Mandate requires{" "}
          {row.requiredContextPolicyKeys.map((key, i) => (
            <span key={key}>
              {i > 0 && ", "}
              <code className="rounded border border-border bg-muted/40 px-1 py-0.5 text-[10px]">
                {key}
              </code>
            </span>
          ))}
          {effectiveClosed
            ? " — declared context policies still deliver with the gate closed."
            : "."}
        </p>
      )}
    </div>
  );
}
