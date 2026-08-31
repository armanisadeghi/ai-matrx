"use client";

// features/bindings/AutoRunBar.tsx
//
// P14 — A BEHAVIOURAL PROMISE IS OFFERABLE ONLY WHEN IT IS FACTUALLY TRUE, AND
// IT NARRATES WHY NOT.
//
// "Run instantly" is not a preference. THE-MODEL law 7: a referenced, fully
// mapped binding runs with no user input, and prompting IS the flexibility
// option. So the control is live only while the mapping genuinely leaves
// nothing to ask, and the sentence beneath it changes as the map changes —
// which is the whole mechanic Arman pointed at on the surface bind panel.
//
// 🚨 THE AUTO-RUN INVERSION, closed. A mandate binding could not carry this at
// all until 2026-08-31 (`mandate.binding.auto_run`), so a job bound through a
// mandate could never promise what the same job bound to a surface had promised
// for months. One column, one shared fact, one set of sentences.
//
// NOTHING IS RE-IMPLEMENTED HERE:
//   · the FACT is `evaluateBindingAutoRun` — the same function the surface bind
//     panel gates its control with, and the same file whose launch-time half
//     re-checks the promise before it fires;
//   · the four SENTENCES are the ones at `SurfaceAgentBindPanel.tsx:265-271`,
//     word for word, with the surface's noun swapped for this domain's.
//
// This file only owns the translation from a job binding's ordered, many-source
// consumption map to the one-mapping-per-target shape that fact reads.

import { Zap } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ServerNotes } from "@/components/official/ServerNotes";
import { cn } from "@/lib/utils";
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

export function AutoRunBar({
  targets,
  map,
  value,
  onChange,
  disabled = false,
  serverNotes = [],
}: AutoRunBarProps) {
  const eligibility = evaluateBindingAutoRun(
    targets.map((t) => ({ name: t.name, required: t.required })),
    autoRunMappingsFor(map),
  );
  // The promise is only ON when it is also TRUE — a stored `true` whose map has
  // since started asking reads as off here and is never sent as true.
  const on = value === true && eligibility.eligible;

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <Zap
          className={cn(
            "h-3.5 w-3.5",
            on ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="text-[12.5px] font-semibold text-foreground">
          Run instantly
        </span>
        <Switch
          className="ml-auto"
          checked={on}
          disabled={disabled || !eligibility.eligible}
          aria-label="Run instantly when this job fires"
          onCheckedChange={(next) => onChange(next)}
        />
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
        {autoRunSentence(eligibility, on)}
      </p>
      {/* WHAT THE SAVE ACTUALLY DID, in the server's words. Amber, because
          every sentence that lands here is the write telling you it did not do
          what you asked — never decoration. */}
      {/* The shared primitive (`components/official/ServerNotes`) — this block
          was its birthplace in v0.4.1567 and is now one of its callers, so the
          run panels and this bar cannot drift apart. */}
      <ServerNotes
        heading="What the save did"
        notes={serverNotes}
        className="mt-1.5"
        testId="binding-save-notes"
      />
      {/* P15 — an unavailable control carries its own reason, and the reason is
          never the control being greyed out. */}
      {!eligibility.eligible ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
          {eligibility.reason === "prompts_user"
            ? "A job that asks the person something is the flexible option, not the instant one — take the question off that input to offer this."
            : "Feed every required input above and this becomes available."}
        </p>
      ) : null}
    </div>
  );
}
