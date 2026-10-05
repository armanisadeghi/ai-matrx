"use client";

/**
 * The body of an explicit "show data" toggle on a data-event block.
 *
 * The toggle is a deliberate raw view — kindless data stays JSON there, which
 * is correct. A payload that carries a `__kind` (at any depth) is a kind, and
 * a kind is never drawn as raw JSON (Arman, 2026-09-30): it renders through
 * the one settled-answer door, `AnswerValueView` (kind → its component, a
 * kind nested in data → the structured floor that routes it).
 */

import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";

export function ToggledDataBody({
  value,
  className,
}: {
  value: unknown;
  /** The `<pre>` classes the block used for its JSON view. */
  className: string;
}) {
  // Every value shape is asked (K1, round 7): a tool `result` is typed Any
  // server-side and often arrives as a plain STRING holding kind JSON.
  if (valueCarriesKind(value)) {
    return (
      <div className="min-w-0 overflow-auto" data-toggled-data="kind">
        <AnswerValueView value={value} density="inline" />
      </div>
    );
  }
  return <pre className={className}>{JSON.stringify(value, null, 2)}</pre>;
}

export default ToggledDataBody;
