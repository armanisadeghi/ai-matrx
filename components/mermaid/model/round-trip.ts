/**
 * The round-trip fidelity gate — the hard guarantee behind structural editing.
 *
 * Structural modes (visual/outline) are enabled ONLY when the adapter has
 * PROVEN lossless round-trip on this exact document: serialize(parse(s)) must
 * equal s up to declared-safe normalization (trailing whitespace, blank-line
 * collapse). Anything else downgrades to code-only BEFORE the user can edit —
 * silent content destruction is structurally impossible, not just unlikely.
 */

import type { MermaidAdapter } from "./adapter";
import type { ParseOutcome } from "./types";

/** Declared-safe normalization: per-line trailing whitespace + blank runs. */
export function normalizeForComparison(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export interface GatedParseResult {
  outcome: ParseOutcome;
  /** Present when the gate fired — what serialize produced vs the original. */
  roundTripDiff?: { expected: string; actual: string };
}

export function parseWithFidelityGate(
  adapter: MermaidAdapter,
  source: string,
): GatedParseResult {
  const outcome = adapter.parse(source);
  if (outcome.status !== "ok") return { outcome };

  let serialized: string;
  try {
    serialized = adapter.serialize(outcome.doc);
  } catch (err) {
    console.warn(
      `[MermaidFidelityGate] ${adapter.diagramType} serialize threw during gate — downgrading to code-only`,
      err,
    );
    return {
      outcome: {
        status: "code-only",
        reason: "serializer failed on this document",
        diagnostics: [],
      },
    };
  }

  const expected = normalizeForComparison(source);
  const actual = normalizeForComparison(serialized);
  if (expected !== actual) {
    // Loud by design: a gate firing means the adapter has a fidelity bug or
    // the document uses syntax we parse imperfectly — either way we must know.
    console.warn(
      `[MermaidFidelityGate] ${adapter.diagramType} round-trip mismatch — structural editing disabled for this document`,
      { expected, actual },
    );
    return {
      outcome: {
        status: "code-only",
        reason: "this diagram uses syntax that structural editing can't preserve yet",
        diagnostics: [],
      },
      roundTripDiff: { expected, actual },
    };
  }

  return { outcome };
}
