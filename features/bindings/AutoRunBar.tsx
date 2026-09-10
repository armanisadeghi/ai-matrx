"use client";

// Mandate-wide pause/resume is not implemented across execution callers.
// Mapping completeness cannot establish that capability. Keep this control
// unavailable until the runtime can enforce it for every invocation.

import { FieldHelp } from "@/components/official/ConfigurationFields";
import { ToggleLeft } from "lucide-react";

import { ServerNotes } from "@/components/official/ServerNotes";
import {
  evaluateBindingAutoRun,
  type BindingAutoRunEligibility,
} from "@/features/surfaces/utils/binding-auto-run";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { ValueMappingMap } from "@/features/surfaces/types";
import type { ConsumptionMap } from "@/features/mandates/provision-shapes";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";

/**
 * A job binding's map → the shape the shared eligibility fact reads.
 *
 * The fact asks two questions of each target: does anything ASK the person, and
 * is every REQUIRED target fed by something the binding supplies. A job map is
 * ORDERED and MANY-SOURCED (D18.2), so:
 *   · a target with ANY `prompt_user` source asks — one question in a
 *     five-source join is still a question;
 *   · otherwise the target is fed, and `surface_value` is the fact's word for
 *     "the binding supplies it" (the wire word is `offered_value`; this is the
 *     same display translation `mappingForRow` already makes).
 *   · a source still waiting for its pick feeds nothing, so it is left out and
 *     the target reads as unmapped — which is exactly what it is.
 */
export function autoRunMappingsFor(map: ConsumptionMap): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const [name, sources] of Object.entries(map)) {
    const asks = sources.find((entry) => entry.mapType === "prompt_user");
    if (asks) {
      out[name] = { mapType: "prompt_user", prompt: asks.prompt };
      continue;
    }
    const fed = sources.find(
      (entry) =>
        entry.mapType === "direct_value" ||
        (entry.mapType === "offered_value" && entry.target !== ""),
    );
    if (!fed) continue;
    out[name] =
      fed.mapType === "direct_value"
        ? { mapType: "direct_value", target: fed.target }
        : fed.mapType === "offered_value"
          ? { mapType: "surface_value", target: fed.target }
          : { mapType: "unmapped" };
  }
  return out;
}

/** The four sentences, verbatim from the surface bind panel, in this domain's
 * nouns. Exported so a test can hold them without rendering. */
export function autoRunSentence(
  eligibility: BindingAutoRunEligibility,
  on: boolean,
): string {
  const named = eligibility.blockers
    .map((name) => formatVariableDisplayName(name))
    .join(", ");
  if (eligibility.eligible) {
    return on
      ? "Runs instantly — every input is mapped, nothing to ask"
      : "Waits for you to press Run";
  }
  return eligibility.reason === "prompts_user"
    ? `Waits for you to press Run — this mapping asks for ${named}`
    : `Waits for you to press Run — ${named} ${eligibility.blockers.length === 1 ? "is" : "are"} not mapped yet`;
}

export interface AutoRunBarProps {
  targets: readonly BindingTarget[];
  map: ConsumptionMap;
  /** The stored answer. `null` = this binding has no opinion yet. */
  value: boolean | null;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * 🚨 THE SERVER'S OWN SENTENCES ABOUT THE LAST WRITE (`BindingResult.notes`,
   * aidream v0.2.456), rendered VERBATIM.
   *
   * The bar's own sentence is a PREVIEW: it describes the draft on screen, and
   * the draft is not what is stored. The server re-checks the promise at write
   * time and refuses it down to `false` when the map asks the person something
   * — and it now says so in prose instead of only in a log line the person
   * cannot hear. When the server has spoken about the row that exists, its
   * words win; the preview keeps describing the draft beside them.
   *
   * The workspace clears this the moment the draft changes, so these sentences
   * are never a description of a mapping that has since moved.
   */
  serverNotes?: readonly string[];
}

export function AutoRunBar({ serverNotes = [] }: AutoRunBarProps) {
  return (
    <div>
      <div
        className="flex items-center gap-2 text-sm"
        data-testid="mandate-run-instantly"
      >
        <span className="font-semibold">Run instantly</span>
        <FieldHelp
          label="Run instantly"
          triggerLabel="Run instantly — unavailable"
          unavailable
          triggerIcon={
            <ToggleLeft className="h-6 w-6 opacity-50" aria-hidden />
          }
        >
          Unavailable: this mandate cannot enforce a pause for user intervention
          across all execution paths.
        </FieldHelp>
        <span>Unavailable</span>
      </div>
      <ServerNotes
        heading="What the save did"
        notes={serverNotes}
        className="mt-1.5"
        testId="binding-save-notes"
      />
    </div>
  );
}
