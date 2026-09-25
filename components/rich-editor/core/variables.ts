// components/rich-editor/core/variables.ts
//
// `{{variable}}` classification — the behavior the prompt builder's
// HighlightedText established (features/agents/components/variables-management),
// as one pure function both editor views use:
//
//   declared    the surface declares this name — it resolves at run time
//   undeclared  a declarable name nobody declared — it resolves to NOTHING
//   literal     not a declarable name ({{step_1.output.x}}) — sent as written
//   unbound     the surface declares no variables at all (a note), so there is
//               nothing to check against; shown neutral, never as an error

import { isDeclarableVariableName } from "@/features/agents/utils/variable-utils";

export type VariableState = "declared" | "undeclared" | "literal" | "unbound";

/** A variable the surface declares, with its type when the surface knows it. */
export interface DeclaredVariable {
  name: string;
  type?: string;
  description?: string;
}

export interface VariableInfo {
  name: string;
  state: VariableState;
  declared: DeclaredVariable | null;
  /** Hover text in plain English. */
  title: string;
}

const VARIABLE_RE = /^\{\{([^}]+)\}\}$/;

/** The name inside `{{name}}`, or null when the raw text is not a variable. */
export function variableName(raw: string): string | null {
  return VARIABLE_RE.exec(raw)?.[1] ?? null;
}

export function classifyVariable(
  raw: string,
  declared: readonly DeclaredVariable[] | null | undefined,
): VariableInfo {
  const name = variableName(raw) ?? raw;
  const trimmed = name.trim();
  if (!declared) {
    return {
      name,
      state: isDeclarableVariableName(trimmed) ? "unbound" : "literal",
      declared: null,
      title: isDeclarableVariableName(trimmed)
        ? `Variable: ${name}`
        : `Literal text — "${name}" is not a valid variable name, so it is sent as written`,
    };
  }
  const match = declared.find((variable) => variable.name === name) ?? null;
  if (match) {
    return {
      name,
      state: "declared",
      declared: match,
      title: `Variable: ${name}${match.type ? ` (${match.type})` : ""}${match.description ? ` — ${match.description}` : ""}`,
    };
  }
  if (!isDeclarableVariableName(trimmed)) {
    return {
      name,
      state: "literal",
      declared: null,
      title: `Literal text — "${name}" is not a valid variable name, so it is sent as written`,
    };
  }
  return {
    name,
    state: "undeclared",
    declared: null,
    title: `Undefined variable: ${name} — it resolves to nothing until it is declared`,
  };
}

/** Tailwind classes per state (the HighlightedText palette). */
export const VARIABLE_STATE_CLASS: Record<VariableState, string> = {
  declared:
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  undeclared:
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  literal: "bg-muted text-muted-foreground border-border",
  unbound: "bg-primary/10 text-primary border-primary/30",
};

/** A typed name for a new variable: letters, digits and underscores. */
export function toVariableName(input: string): string {
  return input
    .trim()
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

const VARIABLE_IN_TEXT_RE = /\{\{\s*([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\s*\}\}/gu;

/** Every distinct `{{name}}` in a text, in order of first appearance. */
export function variableNamesInText(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(VARIABLE_IN_TEXT_RE)) seen.add(match[1]);
  return [...seen];
}

export interface VariableSuggestion {
  name: string;
  type?: string;
  description?: string;
  /** Declared by the surface, already used in this document, or a new name from what was typed. */
  source: "declared" | "document" | "new";
}

/**
 * THE `{{` menu's rows, for both views: the surface's declared variables, then
 * the variables this document already uses (so a prompt's own `{{site_name}}`
 * is one keystroke away even where the host declares nothing), then the typed
 * name as a new variable.
 */
export function variableSuggestions(
  declared: readonly DeclaredVariable[],
  documentNames: readonly string[],
  query: string,
): VariableSuggestion[] {
  const q = query.replace(/\}+$/, "").trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const out: VariableSuggestion[] = declared
    .filter((variable) => matches(variable.name))
    .map((variable) => ({ ...variable, source: "declared" as const }));
  const known = new Set(declared.map((variable) => variable.name));
  for (const name of documentNames) {
    if (known.has(name) || !matches(name)) continue;
    known.add(name);
    out.push({ name, source: "document" });
  }
  const fresh = toVariableName(query.replace(/\}+$/, ""));
  if (fresh && !known.has(fresh)) out.push({ name: fresh, source: "new" });
  return out;
}
