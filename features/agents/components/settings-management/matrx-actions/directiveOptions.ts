/**
 * Directive options for the Matrx Actions tab's "selected actions" picker.
 *
 * Combines the canonical named built-in directives with the live action catalog
 * (`useActionCatalog`) — every noun whose write verb is wired (`state === "yes"`)
 * becomes a `verb:noun` directive type the agent can be allowed to auto-apply.
 */

import type { ActionCatalog } from "@/features/action-catalog/types";

export interface DirectiveOption {
  /** The directive type string stored in `matrx_actions.allow`. */
  type: string;
  /** Human label for the row. */
  label: string;
  /** Grouping bucket (family / "Built-in"). */
  family: string;
}

/** Named built-in directives — always available regardless of catalog state. */
const BUILTIN_DIRECTIVES: DirectiveOption[] = [
  { type: "create_project_with_tasks", label: "Create project with tasks", family: "Built-in" },
  { type: "create_task", label: "Create task", family: "Built-in" },
  { type: "db_create", label: "Create record (db_create)", family: "Built-in" },
  { type: "db_update", label: "Update record (db_update)", family: "Built-in" },
];

const WRITE_VERBS = ["create", "update", "delete"] as const;

/**
 * Build the full option list: built-ins first, then every wired `verb:noun`
 * write action from the catalog, grouped by family.
 */
export function buildDirectiveOptions(
  catalog: ActionCatalog | null,
): DirectiveOption[] {
  const options: DirectiveOption[] = [...BUILTIN_DIRECTIVES];
  if (!catalog) return options;
  for (const noun of catalog.nouns) {
    for (const verb of WRITE_VERBS) {
      if (noun[verb] === "yes") {
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
