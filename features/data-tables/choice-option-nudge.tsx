/**
 * choice-option-nudge — "Add 'ACTIVE' as an option?" the moment an off-list
 * value is saved into a choice column.
 *
 * A choice column never refuses a value (`ChoiceInput`, `allowOther`): the
 * typed value is stored and renders amber. That is right — raw data stays
 * readable — but it leaves the column's OPTIONS behind: color rules, filters,
 * the agent's `choices` and every other consumer of the declared list never
 * learn the new value. Arman (2026-09-25): "the system should have asked me if
 * I want to add it as an option — a little quick reminder that doesn't block
 * or annoy and will add with a little click."
 *
 * So every path that saves a choice cell calls `offerToAddChoiceOption`: a
 * toast with ONE action, "Add as option", which appends the value to the
 * column's inline options through the ONE format writer (`setFieldFormat`).
 * Nothing blocks, nothing is asked twice for the same value in a session, and
 * a column whose options come from a shared pick list is told so instead of
 * being offered an inline option it cannot hold.
 *
 * Pure decision + one side-effecting offer; the caller supplies the toast and
 * the reload so the grid, the row forms and any future writer share it.
 */
"use client";

import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import { inlineChoices, isChoiceFormat } from "@/lib/field-formats/choices";
import { resolveFieldFormat } from "@ai-matrx/design-system/field-formats";
import type { FieldChoice, FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

import { setFieldFormat } from "./service";
import { isServiceFailure } from "./types";

export type NudgeField = {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  metadata?: unknown;
};

export type NudgeDecision =
  | { kind: "none" }
  /** The column's options live on a shared pick list — an inline add would be a fork. */
  | { kind: "list_bound"; values: string[] }
  | { kind: "offer"; values: string[]; format: FieldFormatConfig };

/** Which of the saved value(s) are not among the column's declared options. */
export function decideChoiceNudge(field: NudgeField, saved: unknown): NudgeDecision {
  const format = resolveFieldFormat(field.data_type, field.metadata);
  if (!isChoiceFormat(format.id) || format.id === "person") return { kind: "none" };
  const values = (Array.isArray(saved) ? saved : [saved])
    .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
    .filter(Boolean);
  if (values.length === 0) return { kind: "none" };
  if (format.options?.structuredList?.listId) {
    return { kind: "list_bound", values };
  }
  const declared = new Set(inlineChoices(format.options).map((c) => c.value));
  const missing = [...new Set(values)].filter((v) => !declared.has(v));
  if (missing.length === 0) return { kind: "none" };
  return { kind: "offer", values: missing, format };
}

/**
 * THE ENUM NUDGE, DECIDED BEFORE A CELL IS SAVED (lane CHOICE-COLUMN-EDIT, Arman 2026-09-27:
 * "when I'm editing cells, it's supposed to allow me to add any value and if the value is not in
 * the defined list of enums, it needs to ask me if I want to add it or not and if I want to add
 * it, then it needs to do it").
 *
 * `nudge` is the organization's Feature Knob `custom/choice_nudge`:
 *  - ask (the default): the cell asks "Add "<words>" to the choices for <column>?" — Add, Keep as
 *    typed (only when the column takes other values), Cancel;
 *  - always_add: the words become choices without asking;
 *  - never_add: kept as typed where the column takes other values, otherwise not saved.
 * A column bound to a shared pick list is not asked here: its list is edited where the list lives.
 */
export type TypedChoiceDecision =
  | { kind: "none" }
  | { kind: "ask"; words: string[]; canKeep: boolean }
  | { kind: "add"; words: string[] }
  | { kind: "keep" }
  | { kind: "not_a_choice"; words: string[] };

export function decideTypedChoice(
  format: FieldFormatConfig | null | undefined,
  saved: unknown,
  nudge: "ask" | "always_add" | "never_add",
): TypedChoiceDecision {
  if (!format || !isChoiceFormat(format.id) || format.id === "person") return { kind: "none" };
  if (format.options?.structuredList?.listId) return { kind: "none" };
  const declared = new Set(inlineChoices(format.options).flatMap((c) => [c.value.toLowerCase(), (c.label ?? c.value).toLowerCase()]));
  const words = [
    ...new Set(
      (Array.isArray(saved) ? saved : [saved])
        .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
        .filter((v) => v !== "" && !declared.has(v.toLowerCase())),
    ),
  ];
  if (words.length === 0) return { kind: "none" };
  const canKeep = format.options?.allowOther !== false;
  if (nudge === "always_add") return { kind: "add", words };
  if (nudge === "never_add") return canKeep ? { kind: "keep" } : { kind: "not_a_choice", words };
  return { kind: "ask", words, canKeep };
}

/** Values already offered this session, per column — never nag twice. */
const offered = new Set<string>();

/**
 * Show the nudge for a just-saved choice cell. Returns true when a toast was
 * shown. `onAdded` runs after the option landed so the caller can reload the
 * fields (the chip turns from amber to the option's color on the next paint).
 */
export function offerToAddChoiceOption(args: {
  tableId: string;
  field: NudgeField;
  saved: unknown;
  onAdded?: () => void;
}): boolean {
  const decision = decideChoiceNudge(args.field, args.saved);
  if (decision.kind === "none") return false;
  const key = `${args.tableId}:${args.field.field_name}:${decision.values.join("\u0000")}`;
  if (offered.has(key)) return false;
  offered.add(key);

  const quoted = decision.values.map((v) => `"${v}"`).join(", ");
  if (decision.kind === "list_bound") {
    toast({
      title: `${quoted} is not an option of ${args.field.display_name}`,
      description: "This column's options come from a shared list. Add it there and every table that uses the list gets it.",
    });
    return true;
  }

  const add = async () => {
    const existing = inlineChoices(decision.format.options);
    const next: FieldChoice[] = [...existing, ...decision.values.map((value) => ({ value }))];
    const result = await setFieldFormat({
      tableId: args.tableId,
      fieldId: args.field.id,
      format: { ...decision.format, options: { ...(decision.format.options ?? {}), choices: next } },
    });
    if (isServiceFailure(result)) {
      toast({ title: "Could not add the option", description: result.error, variant: "destructive" });
      return;
    }
    toast({
      title: `Added ${quoted} to ${args.field.display_name}`,
      description: "Color rules, filters and agents now know it. Give it a color in Column settings.",
    });
    args.onAdded?.();
  };

  toast({
    title: `Add ${quoted} as an option of ${args.field.display_name}?`,
    description: "Saved as typed. As an option it gets a color and shows up in rules and filters.",
    action: (
      <ToastAction altText="Add as option" onClick={() => void add()}>
        Add as option
      </ToastAction>
    ),
  });
  return true;
}
