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
