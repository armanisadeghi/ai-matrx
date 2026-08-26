// features/hr/shared/useVisibleFields.ts
//
// 🚨 THE SENSITIVITY RENDERING RULE, MADE MECHANICAL (SPEC-UI-IA §4.2,
//    SPEC-EMPLOYEES §1.3 — binding on every HR surface).
//
//   A FIELD THE VIEWER CANNOT ACCESS IS ABSENT FROM THE DOM.
//   Not disabled. Not masked. Not "•••• (no access)". Not a lock icon.
//
// The rule has four consequences, and all four are implemented here rather than
// remembered by each page:
//
//   1. A tab whose every field is inaccessible is NOT IN THE TAB BAR. The server's
//      `tabs` array already omits it; nothing here may add one back.
//   2. A section with no accessible fields RENDERS NO HEADING. A heading with
//      nothing under it tells the viewer what exists and taunts them with it.
//      → `useVisibleFields(...).length === 0` is the test, and `<SensitiveSection>`
//        performs it for you.
//   3. LAYOUT MUST NOT LEAK. Absent fields collapse and the grid re-flows. A gap
//      where compensation would be is a disclosure — so there are no reserved
//      slots, no fixed row heights, and no placeholder nodes anywhere below.
//   4. The one permitted disclosure is a WORDED EXISTENCE STATEMENT ("This person
//      has an approved leave. Details are held by HR.") — `<ExistenceStatement>`,
//      governed by `hr.disclosure.existence_statements`, never a masked field.
//
// HOW ABSENCE IS EXPRESSED ON THE WIRE. The server already returns ONLY the keys
// this viewer may see — `hr_employee_profile.personal` is built key-by-key per
// viewer kind, and that is deliberate. So the test is `name in source`, and the two
// states are genuinely different facts that say different things:
//
//     key ABSENT           → this viewer has no access. Render NOTHING.
//     key present, empty   → this viewer may see it; nobody has filled it in.
//
// Never "normalize" a payload into a fully-populated object with nulls. That single
// line would destroy the distinction the whole rule rests on.
//
// 🚨 SCATTERED `{canSee && …}` PER FIELD IS A REVIEW FAILURE. Everything routes
// through this hook and `<SensitiveField>`.

import type { ReactNode } from "react";

/**
 * One field's presentation. Distributed over the source's keys so `format` is typed
 * against the value it actually receives — there is no `unknown` cast at a call site.
 *
 * There is deliberately NO way to supply a value: a field renders the value at its
 * key or does not render. That is what makes a placeholder for an absent field
 * impossible to write rather than merely discouraged.
 */
export type HrFieldSpec<T extends object> = {
  [K in Extract<keyof T, string>]: {
    name: K;
    label: string;
    /** Render the value. Omit for plain text. Never called for an absent field. */
    format?: (value: T[K]) => ReactNode;
    /**
     * What to show when the viewer MAY see the field and it is simply not filled
     * in. Defaults to "Not provided". This is never shown for an absent field.
     */
    emptyLabel?: string;
    /** One line under the label, for a field whose meaning is not self-evident. */
    hint?: string;
    /** A door this value opens (§4.5 — every rendered identity opens). */
    href?: (value: T[K]) => string | null;
  };
}[Extract<keyof T, string>];

export type HrVisibleField = {
  name: string;
  label: string;
  hint?: string;
  /** The raw value. `isEmpty` says whether it is worth rendering as a value. */
  value: unknown;
  isEmpty: boolean;
  emptyLabel: string;
  content: ReactNode;
  href: string | null;
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Keep only the fields THIS payload actually carries, in the order given.
 *
 * Pure, and deliberately not a React hook internally — it is named `use*` because
 * every call site is a component and the name is where a reviewer looks for the
 * rule. Call it with the object the server returned, never with one you assembled.
 */
export function useVisibleFields<T extends object>(
  source: T | null | undefined,
  specs: readonly HrFieldSpec<T>[],
): HrVisibleField[] {
  if (!source) return [];

  const fields: HrVisibleField[] = [];
  for (const spec of specs) {
    // THE TEST. `in`, not a truthiness check — a viewer who may see a field that
    // happens to be null still sees the field, and a viewer who may not see it
    // gets no trace of it either way.
    if (!(spec.name in source)) continue;

    const value = (source as Record<string, unknown>)[spec.name];
    const empty = isEmptyValue(value);
    const format = spec.format as ((v: unknown) => ReactNode) | undefined;
    const hrefFor = spec.href as ((v: unknown) => string | null) | undefined;

    fields.push({
      name: spec.name,
      label: spec.label,
      hint: spec.hint,
      value,
      isEmpty: empty,
      emptyLabel: spec.emptyLabel ?? "Not provided",
      content: empty ? null : format ? format(value) : String(value),
      href: empty || !hrefFor ? null : hrefFor(value),
    });
  }
  return fields;
}

/**
 * Does this viewer have ANY of these fields? The test a section runs before it
 * renders a heading, and a tab runs before it claims a place in the tab bar.
 */
export function hasAnyVisibleField<T extends object>(
  source: T | null | undefined,
  names: readonly Extract<keyof T, string>[],
): boolean {
  if (!source) return false;
  return names.some((name) => name in source);
}
