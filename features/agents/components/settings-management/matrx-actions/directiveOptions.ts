/**
 * Directive options for the Matrx Actions tab's "selected actions" picker.
 *
 * FULLY DERIVED from the live action catalog (`useActionCatalog`) — the server's
 * registries are the single source of truth. The Plane-2 functions section
 * supplies the named procedures (deprecated legacy names are labeled but still
 * selectable — stored agents may carry them); every noun whose write verb is
 * wired (`state === "yes"`) becomes a `verb:noun` directive type. A new server
 * registration appears here with ZERO frontend edits.
 */

import type { ActionCatalog } from "@/features/action-catalog/types";

export interface DirectiveOption {
  /** The directive type string stored in `matrx_actions.allow`. */
  type: string;
  /** Human label for the row. */
  label: string;
  /** Grouping bucket (family / "Functions"). */
  family: string;
}

/** Verbs that produce a side effect — everything except the read verbs. */
function writeVerbs(catalog: ActionCatalog): string[] {
  return (catalog.verbs ?? []).filter((v) => v !== "reference" && v !== "view");
}

function functionLabel(name: string, deprecated: boolean | undefined): string {
  const pretty = name.replace(/_/g, " ");
  return deprecated ? `${pretty} (legacy)` : pretty;
}

/**
 * Build the full option list: the server's registered functions first, then
 * every wired `verb:noun` write action from the catalog, grouped by family.
 */
export function buildDirectiveOptions(
  catalog: ActionCatalog | null,
): DirectiveOption[] {
  if (!catalog) return [];
  const options: DirectiveOption[] = [];
  for (const fn of catalog.functions ?? []) {
    options.push({
      type: fn.name,
      label: functionLabel(fn.name, fn.deprecated),
      family: fn.deprecated ? "Legacy directives" : "Functions",
    });
  }
  const verbs = writeVerbs(catalog);
  for (const noun of catalog.nouns) {
    for (const verb of verbs) {
      if ((noun as Record<string, unknown>)[verb] === "yes") {
        options.push({
          type: `${verb}:${noun.noun}`,
          label: `${verb} ${noun.noun}`,
          family: noun.family || "Other",
        });
      }
    }
  }
  return options;
}

/** Group options by family, preserving insertion order within each group. */
export function groupDirectiveOptions(
  options: DirectiveOption[],
): { family: string; options: DirectiveOption[] }[] {
  const groups: { family: string; options: DirectiveOption[] }[] = [];
  const index = new Map<string, DirectiveOption[]>();
  for (const opt of options) {
    let bucket = index.get(opt.family);
    if (!bucket) {
      bucket = [];
      index.set(opt.family, bucket);
      groups.push({ family: opt.family, options: bucket });
    }
    bucket.push(opt);
  }
  return groups;
}
