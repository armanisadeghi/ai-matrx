/**
 * Choice resolution — the ONE place a `choice` / `multi_choice` format turns
 * into a concrete option set.
 *
 * A choice format names its options one of two ways, and both land here:
 *
 *   inline           `options.choices`         — private to this column
 *   structured list  `options.structuredList`  — a shared pick list, so
 *                                                "Status" means the same five
 *                                                things everywhere
 *
 * WHY THE LIST BINDING IS THE INTERESTING ONE. A structured list item already
 * carries a `group_name`, so binding a column to a list gets **tiered options
 * for free**: the cell stores the item, the item knows its group, and every
 * surface downstream (grouped dropdown, grouped filter picker, future group-by)
 * reads the tier without the table storing it or anyone maintaining a second
 * list. Binding to ONE group of a list narrows the options with no new list at
 * all.
 *
 * THE BINDING SHAPE IS NOT OURS TO INVENT. `StructuredListBinding` is the same
 * `{ listId, groupName, multiple }` the agent-variable system already writes
 * (aidream's `PicklistBinding`, FE `customComponent.structured_list`). One
 * option vocabulary across columns and variables, or the same list means two
 * different things depending on who reads it.
 *
 * Loading is NOT reimplemented here: `useStructuredListForSelection`
 * (`features/user-lists/`) already does the fetch, the session cache, the
 * group ordering, the group filter, and the label-only projection that keeps an
 * item's secret description server-side. This module adapts its output to
 * `FieldChoice` and nothing more.
 */

import { useMemo } from "react";

import {
  useStructuredListForSelection,
  useStructuredListsForSelection,
} from "@/features/user-lists/hooks/useStructuredListForSelection";
import type { PicklistSelectionItem } from "@/features/user-lists/types";

import type {
  FieldChoice,
  FieldFormatConfig,
  FieldFormatOptions,
} from "./types";

/** Format ids whose options come from this module. */
export const CHOICE_FORMAT_IDS = ["choice", "multi_choice"] as const;

export function isChoiceFormat(id: string | undefined | null): boolean {
  return id === "choice" || id === "multi_choice";
}

/**
 * The chip palette. Names, never raw hex, so a chip is legible on both grounds
 * and a theme change moves them all at once. `color` on a choice holds one of
 * these keys; anything unrecognized falls back to neutral rather than breaking.
 */
export const CHOICE_COLORS = {
  neutral: "bg-muted text-foreground border-border",
  slate: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
  green: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",
  amber: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
  red: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
  blue: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800",
  violet:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800",
  teal: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-800",
} as const;

export type ChoiceColorName = keyof typeof CHOICE_COLORS;

export const CHOICE_COLOR_NAMES = Object.keys(
  CHOICE_COLORS,
) as ChoiceColorName[];

export function choiceColorClass(color: string | undefined): string {
  if (color && color in CHOICE_COLORS) {
    return CHOICE_COLORS[color as ChoiceColorName];
  }
  return CHOICE_COLORS.neutral;
}

/** One rendered section of a choice list. */
export type FieldChoiceGroup = {
  /** Section heading. Empty string for the ungrouped bucket. */
  group: string;
  choices: FieldChoice[];
};

export type ResolvedChoices = {
  choices: FieldChoice[];
  /** Sections, in display order. One empty-named group when nothing is grouped. */
  groups: FieldChoiceGroup[];
  /** True while a bound structured list is still loading. */
  loading: boolean;
  /**
   * True when the format names a structured list that could not be read —
   * deleted, or not shared with this user. Never silently treated as "no
   * options": a column whose list vanished must SAY so, because rendering it as
   * an empty dropdown would look like the column has nothing to pick.
   */
  unavailable: boolean;
  /** May a value outside the list be entered? Defaults to true. */
  allowOther: boolean;
  /**
   * The field whose cell value narrows these options, when this column is
   * DEPENDENT on another. Null for an ordinary column. Callers that have a row
   * in hand pass it to `choicesForRow`; callers that do not (a settings
   * preview) show every group, which is the correct unconstrained answer.
   */
  groupFromField: string | null;
};

const EMPTY: FieldChoice[] = [];

/** Options declared directly on the field, normalised and de-duplicated. */
export function inlineChoices(
  options: FieldFormatOptions | undefined,
): FieldChoice[] {
  const raw = options?.choices;
  if (!Array.isArray(raw) || raw.length === 0) return EMPTY;
  const seen = new Set<string>();
  const out: FieldChoice[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.value !== "string") continue;
    const value = entry.value.trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    out.push(entry);
  }
  return out;
}

/** Group an ordered choice list into sections, ungrouped last. */
export function groupChoices(choices: FieldChoice[]): FieldChoiceGroup[] {
  if (choices.length === 0) return [];
  const byGroup = new Map<string, FieldChoice[]>();
  for (const choice of choices) {
    const key = choice.group?.trim() ?? "";
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(choice);
    else byGroup.set(key, [choice]);
  }
  if (byGroup.size === 1 && byGroup.has("")) {
    return [{ group: "", choices }];
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => {
      // The ungrouped bucket renders last so named tiers lead — same ordering
      // rule `useStructuredListForSelection` applies to "Ungrouped".
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    })
    .map(([group, groupChoicesList]) => ({ group, choices: groupChoicesList }));
}

function itemToChoice(item: PicklistSelectionItem): FieldChoice {
  // The cell stores the LABEL, not the item id — raw data stays readable and an
  // existing column can adopt a list without a single value being rewritten.
  return {
    value: item.label,
    ...(item.group_name ? { group: item.group_name } : {}),
    ...(item.help_text ? { help: item.help_text } : {}),
  };
}

/**
 * Resolve a field's choice options, hydrating a bound structured list.
 *
 * Safe to call for ANY format — a non-choice format resolves to no options and
 * never triggers a fetch, so callers do not need to branch before calling.
 */
export function useFieldChoices(
  format: FieldFormatConfig | null | undefined,
): ResolvedChoices {
  const isChoice = isChoiceFormat(format?.id);
  const binding = isChoice ? format?.options?.structuredList : undefined;
  const listId = binding?.listId ?? null;

  const list = useStructuredListForSelection(listId, binding?.groupName);

  const inline = useMemo(
    () => (isChoice ? inlineChoices(format?.options) : EMPTY),
    [isChoice, format?.options],
  );

  const listChoices = useMemo(
    () => (listId ? list.items.map(itemToChoice) : EMPTY),
    [listId, list.items],
  );

  // The binding wins when present: a column bound to a shared list must not
  // silently fall back to a stale private copy of the options.
  const choices = listId ? listChoices : inline;

  const groups = useMemo(() => groupChoices(choices), [choices]);

  return {
    choices,
    groups,
    loading: listId ? list.loading : false,
    unavailable: listId ? list.unavailable : false,
    allowOther: format?.options?.allowOther !== false,
    groupFromField: binding?.groupName ? null : (binding?.groupFromField ?? null),
  };
}

/**
 * Narrow a column's options to the group its controlling cell names.
 *
 * A pure function on purpose — the whole dependent-column feature is one filter
 * over options that were already loaded. No extra fetch, no dependency graph,
 * and a chain A → B → C resolves simply because each link reads its own
 * controller's current value.
 *
 * Returns every option unchanged when the column is not dependent, when the
 * controlling cell is empty, or when the controlling value matches no group.
 * That last case is deliberate: a controller holding a typo must not leave the
 * user staring at an empty dropdown with nothing to pick and no explanation.
 */
export function choicesForRow(
  resolved: ResolvedChoices | undefined,
  row: Record<string, unknown> | null | undefined,
): ResolvedChoices {
  if (!resolved) {
    return {
      choices: EMPTY,
      groups: [],
      loading: false,
      unavailable: false,
      allowOther: true,
      groupFromField: null,
    };
  }
  const controller = resolved.groupFromField;
  if (!controller || !row) return resolved;

  const raw = row[controller];
  const key = raw === null || raw === undefined ? "" : String(raw).trim();
  if (key === "") return resolved;

  const lowered = key.toLowerCase();
  const narrowed = resolved.choices.filter(
    (c) => (c.group ?? "").trim().toLowerCase() === lowered,
  );
  if (narrowed.length === 0) return resolved;

  return { ...resolved, choices: narrowed, groups: groupChoices(narrowed) };
}

/**
 * Fold resolved options back into a format config so the pure registry
 * `format()` can read them.
 *
 * The registry stays synchronous — it never learns that a structured list
 * exists. Whoever resolved the options hands them over through `options.choices`
 * and the def behaves identically for inline and bound columns.
 */
export function withResolvedChoices(
  format: FieldFormatConfig,
  choices: FieldChoice[],
): FieldFormatConfig {
  if (!isChoiceFormat(format.id) || choices.length === 0) return format;
  return {
    ...format,
    options: { ...(format.options ?? {}), choices },
  };
}

/**
 * Resolve choice options for MANY fields at once — the grid form of
 * `useFieldChoices`.
 *
 * A table renders one cell renderer per column and the column count varies with
 * the data, so a hook per column is a rules-of-hooks violation. This takes the
 * whole field set, resolves every bound list in one pass through the shared
 * session cache, and returns a lookup keyed by machine field name.
 *
 * Fields with no choice format are simply absent from the map, so a caller can
 * pass its entire column list without filtering first.
 */
export function useFieldChoiceMap(
  fields: readonly {
    field_name: string;
    format: FieldFormatConfig | null | undefined;
  }[],
): Map<string, ResolvedChoices> {
  const listIds = fields.map((f) =>
    isChoiceFormat(f.format?.id)
      ? (f.format?.options?.structuredList?.listId ?? null)
      : null,
  );

  const { byListId, unavailable } = useStructuredListsForSelection(listIds);

  return useMemo(() => {
    const out = new Map<string, ResolvedChoices>();
    for (const field of fields) {
      const format = field.format;
      if (!isChoiceFormat(format?.id)) continue;

      const binding = format?.options?.structuredList;
      const listId = binding?.listId;

      if (!listId) {
        const choices = inlineChoices(format?.options);
        out.set(field.field_name, {
          choices,
          groups: groupChoices(choices),
          loading: false,
          unavailable: false,
          allowOther: format?.options?.allowOther !== false,
          groupFromField: null,
        });
        continue;
      }

      const loaded = byListId.get(listId);
      const items = loaded?.items ?? [];
      // Apply the binding's group filter here too, so a column narrowed to one
      // tier renders and validates against exactly that tier.
      const filtered = binding?.groupName
        ? items.filter((i) => i.group_name === binding.groupName)
        : items;
      const choices = filtered.map(itemToChoice);

      out.set(field.field_name, {
        choices,
        groups: groupChoices(choices),
        loading: loaded === undefined && !unavailable.has(listId),
        unavailable: unavailable.has(listId),
        allowOther: format?.options?.allowOther !== false,
        // A DERIVED group is applied per row by `choicesForRow`, so the map
        // deliberately keeps every group here — narrowing it now would leave
        // each row unable to see the tier its own controller names.
        groupFromField: binding?.groupName ? null : (binding?.groupFromField ?? null),
      });
    }
    return out;
  }, [fields, byListId, unavailable]);
}
