/**
 * Pure envelope helpers the chat package needs (chat-package-move P14): the Phase-2 shadow
 * parity check ("does the envelope, reconstructed, deep-equal what JSON.parse sees?").
 *
 * A COMPARISON, NEVER A TRANSFORM — the one lawful shape of `stripKindDeep` outside the two doors.
 * Markers are removed from BOTH sides, symmetrically, inside this predicate, so a marker the parser
 * INJECTED (speculation / expectedRootKind) is not reported as a mismatch against a source that did
 * not carry one. Only a boolean leaves; neither input is mutated and neither reduced value is ever
 * returned, stored, or rendered (KINDS_EVERYWHERE_PLAN §4.2).
 */

import { type CanonicalBlockIR, reconstructRegionValue, stripKindDeep } from "@ai-matrx/content-ir";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!(key in right)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }

  return false;
}

export function envelopeMatchesParsedSource(envelope: CanonicalBlockIR, parsedSource: unknown): boolean {
  if (!isRecord(parsedSource)) return false;
  return deepEqual(stripKindDeep(reconstructRegionValue(envelope)), stripKindDeep(parsedSource));
}
