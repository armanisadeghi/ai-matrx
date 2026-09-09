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
import { StatusToken } from "@/components/official/ConfigurationFields";
import { ShortcutFieldRow } from "@/features/agent-shortcuts/components/next/SettingsSection";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
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
    <section className="space-y-1">
      <ShortcutFieldRow
        title="Automatic context"
        source="Mandate"
        hint="A mandate can block automatic context. It cannot reopen context blocked by the holder. Required context policies still apply."
        metadata={
          <>
            <span>
              <strong>Source:</strong> Mandate
            </span>
            <span>
              <strong>State:</strong> {saving ? "Saving" : "Saved"}
            </span>
            <span>
              <strong>Holder:</strong> {holderClosed ? "Blocked" : "Allowed"}
            </span>
            <span className="inline-flex items-center gap-1">
              <strong>Effective:</strong>{" "}
              <StatusToken
                status={effectiveClosed ? "neutral" : "ok"}
                label={effectiveClosed ? "Blocked" : "Allowed"}
              />
            </span>
          </>
        }
      >
        <label
          className="inline-flex items-center gap-2"
          htmlFor={`mandate-context-gate-${row.id}`}
        >
          <Switch
            id={`mandate-context-gate-${row.id}`}
            aria-label="Allow automatic context"
            checked={!gateClosed}
            disabled={saving || holderClosed}
            onCheckedChange={handleChange}
          />
          <span className="text-sm">{gateClosed ? "No" : "Yes"}</span>
        </label>
      </ShortcutFieldRow>
      <ShortcutFieldRow
        title="Required context policies"
        source="Mandate"
        state="Required"
      >
        <span className="text-sm">
          {row.requiredContextPolicyKeys.length
            ? row.requiredContextPolicyKeys.map((key) => displayLabelForKey(key)).join(", ")
            : "None"}
        </span>
      </ShortcutFieldRow>
    </section>
  );
}
