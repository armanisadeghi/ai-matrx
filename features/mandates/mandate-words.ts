// features/mandates/mandate-words.ts
//
// 🚨 THE ONE RULE FOR NAMING A JOB ON SCREEN (FIX-11, W10-2).
//
// The design rule these screens keep is: **slugs live in mono chips; prose
// speaks labels.** A mandate carries both — a machine key (`mandate.goal_writer`)
// and, usually, a label its author wrote ("Agent Goal Writer"). Every screen
// that printed a job's name resolved the missing-label case the same way, by
// copy-paste: `row.label ?? row.mandate_key`. That is the raw key, in prose
// type, in the place a person reads a name — the same defect R5-1 closed inside
// the refusal sentences, showing up one layer out.
//
// The key is not hidden by this: every one of these screens already renders it
// on its own mono sub-line, which is its honest home.

import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";

/**
 * A job's name as a person reads it.
 *
 * The author's label wins. With no label the LAST SEGMENT of the key is
 * title-cased — `mandate.goal_writer` reads "Goal Writer" — which is a
 * derivation of what the author typed, never an invention. A key with nothing
 * to derive from falls back to the key itself: better said as itself than as an
 * empty name, and still nothing is made up.
 */
export function mandateDisplayName(
  mandateKey: string,
  label?: string | null,
): string {
  const explicit = typeof label === "string" ? label.trim() : "";
  if (explicit) return explicit;
  const lastSegment = mandateKey.split(".").filter(Boolean).pop() ?? mandateKey;
  return formatVariableDisplayName(lastSegment) || mandateKey;
}
