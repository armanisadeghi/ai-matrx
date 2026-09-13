"use client";

/**
 * DOCUMENT PRESENTATION — the two decisions the structured floor was making
 * for the reader with no way to change them, and one it was making WRONG.
 *
 * ── THE DEFECT THIS CLOSES (Expert Book Challenge wall W61, 2026-09-12) ─────
 * On the finished-run showcase of run cef6ae07 — a page written for a parent —
 * the floor printed:
 *
 *     Physician note     None
 *     Physician first    false
 *     Watsons words      …
 *
 * Three separate leaks of the SCHEMA at a reader who never saw a schema:
 *
 *  1. An optional field the producer left null rendered as the word "None".
 *     A field that does not apply is not an answer; it is a row of noise that
 *     pushes the answer down the page. (`KeyValueGrid.renderFieldValue` did
 *     this at `full` density; `inline` already skipped empties, so the SAME
 *     payload read differently in chat and on the showcase.)
 *  2. A boolean flag rendered as the literal token `false` in a mono badge —
 *     a programmer's value, printed verbatim.
 *  3. Every heading came from the payload's KEY. `humanizeKey` is the right
 *     fallback, but when the producer's own JSON Schema carries a `title` for
 *     that property, that title is the AUTHOR'S name for the field and must
 *     win — the key is the machine's name for it.
 *
 * ── WHY IT IS A KNOB, NOT A TASTE ──────────────────────────────────────────
 * Law 6: behavioral choices are org-configurable settings with a default, and
 * "what happens to a field that does not apply" is exactly that — a review
 * desk auditing a form WANTS to see every unanswered field; a parent reading
 * advice does not. So the policy is a value on the ladder
 * ({@link OPTIONAL_FIELDS_KNOB}), resolved per organization/person, defaulting
 * to {@link DEFAULT_OPTIONAL_FIELD_POLICY}.
 *
 * ── AND NOTHING DISAPPEARS (law 4) ─────────────────────────────────────────
 * `omit` does not mean gone. The grid keeps a quiet trailing line naming how
 * many fields did not apply, one click from showing every one of them. The
 * raw-data escape in `StructuredValueView` still carries the untouched payload.
 *
 * This is a PLATFORM primitive: every surface that renders a structured value
 * through the floor inherits it, and no Masterwork, workflow or kind gets its
 * own copy of these rules.
 */

import React, { createContext, useContext, useMemo } from "react";

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

/** What the floor does with a field whose value does not apply. */
export type OptionalFieldPolicy =
  /** Leave it out of the document; a trailing line says how many and opens them. */
  | "omit"
  /** Keep the row, with a quiet "Not applicable" where the value would be. */
  | "note"
  /** Render it exactly as the producer sent it — for audit-shaped surfaces. */
  | "show";

/**
 * The default. A finished deliverable is a document a person reads, and a
 * field the producer had nothing to say about is not part of what they wrote.
 */
export const DEFAULT_OPTIONAL_FIELD_POLICY: OptionalFieldPolicy = "omit";

/** The ladder key an organization or person sets to change the policy. */
export const OPTIONAL_FIELDS_KNOB =
  "shape_system.structured_document.optional_fields";

export function asOptionalFieldPolicy(value: unknown): OptionalFieldPolicy | null {
  return value === "omit" || value === "note" || value === "show" ? value : null;
}

/** One field's authored identity, from the producer's own JSON Schema. */
export interface SchemaFieldLabel {
  /** The schema's `title` — the author's name for this field. */
  label: string;
  /** The schema's `description` — the hover, never printed as a heading. */
  description?: string;
}

export interface StructuredDocumentPresentation {
  /**
   * The policy a HOST decided for this document, or null for "nobody decided"
   * — which is not the same as the default. Null means the reader's own
   * ladder answer wins; a value means a surface overrode it on purpose (an
   * audit desk that must see every unanswered field).
   */
  optionalFields: OptionalFieldPolicy | null;
  /** Authored labels by property key. Empty when nothing declared a schema. */
  labels: Readonly<Record<string, SchemaFieldLabel>>;
}

const DEFAULT_PRESENTATION: StructuredDocumentPresentation = {
  optionalFields: null,
  labels: {},
};

const PresentationContext = createContext<StructuredDocumentPresentation>(
  DEFAULT_PRESENTATION,
);

export function useStructuredDocumentPresentation(): StructuredDocumentPresentation {
  return useContext(PresentationContext);
}

/**
 * Provide the presentation for one document. A host that knows the producer's
 * schema passes it; every grid, table and nested value below inherits it.
 */
export function StructuredDocumentPresentationProvider({
  labels,
  optionalFields,
  children,
}: {
  labels?: Readonly<Record<string, SchemaFieldLabel>> | null;
  /** Force a policy (an audit surface). Omit to follow the ladder. */
  optionalFields?: OptionalFieldPolicy;
  children: React.ReactNode;
}) {
  const inherited = useStructuredDocumentPresentation();
  const value = useMemo<StructuredDocumentPresentation>(
    () => ({
      optionalFields: optionalFields ?? inherited.optionalFields,
      // A nested provider ADDS its schema's labels to the ones above it; a key
      // the inner schema names wins, because it is closer to the value.
      labels: labels ? { ...inherited.labels, ...labels } : inherited.labels,
    }),
    [optionalFields, inherited.optionalFields, labels, inherited.labels],
  );
  return (
    <PresentationContext.Provider value={value}>
      {children}
    </PresentationContext.Provider>
  );
}

/**
 * THE policy in force for the value being rendered: the host's decision when
 * one was made, and the reader's own ladder answer otherwise. This is what
 * every field renderer calls — never `useOptionalFieldPolicy` directly.
 */
export function useResolvedOptionalFieldPolicy(): OptionalFieldPolicy {
  const declared = useStructuredDocumentPresentation().optionalFields;
  const ladder = useOptionalFieldPolicy();
  return declared ?? ladder;
}

/**
 * The ladder-resolved policy for the signed-in person, with the declared
 * default until (and unless) it answers. A read that fails never throws and
 * never blocks the document — the default IS a correct answer.
 */
export function useOptionalFieldPolicy(): OptionalFieldPolicy {
  // Read through the store SINGLETON, not `useAppSelector`. The floor renders
  // in places that have no Provider above them (server pre-render, the copy
  // pipeline, every `renderToString` guard), and a hook that throws there
  // would take the whole document down to change a cosmetic default. No
  // store = no organization = the declared default, which is a correct answer.
  const store = getStoreSingleton();
  const state = store?.getState();
  const organizationId = state
    ? selectEffectiveOrganizationId(state as never)
    : null;
  const userId = state ? selectUserId(state as never) : null;
  const value = useEffectiveKnob(organizationId, userId, OPTIONAL_FIELDS_KNOB);
  return asOptionalFieldPolicy(value) ?? DEFAULT_OPTIONAL_FIELD_POLICY;
}
