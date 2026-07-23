/**
 * The forward composer: given a kind's STORED example (source shape, `__kind`
 * stripped — see `stripRootKind` in studio/instance-service.ts) produce the
 * EMIT/RENDER payload the platform actually detects — `{ "__kind": <slug>,
 * ...data }`.
 *
 * WHY THIS EXISTS: the whole system stores and validates the source shape
 * (no `__kind`), because the schema represents source data and `__kind` is
 * injected only at emit time. But a human or an agent who wants to SEE the
 * component render, paste a working sample into a chat, or teach another agent
 * needs the render shape — the one that leads with `__kind`. That shape lived
 * only inside the skill body until now. This is the one-liner that makes it
 * obtainable anywhere, the mirror of `stripRootKind`.
 *
 * Objects get `__kind` prepended (first key, matching the house convention and
 * the parser's expectation). Scalars/arrays are returned unchanged — for those
 * kinds the identity travels out of band (`root.kind`), there is no key to add.
 */

import { KIND_KEY } from "./kind-schema.types";

export function withRootKind(kind: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { [KIND_KEY]: kind, ...(value as Record<string, unknown>) };
  }
  return value;
}

/** The copy-ready render payload: pretty JSON of `{ __kind, ...data }`. */
export function emitPayloadJson(kind: string, value: unknown): string {
  return JSON.stringify(withRootKind(kind, value), null, 2);
}

/**
 * The copy-ready render BLOCK — the render payload inside a ```json fence, the
 * exact form an agent emits and a user pastes into a prompt or a message to see
 * it render live.
 */
export function emitPayloadFence(kind: string, value: unknown): string {
  return "```json\n" + emitPayloadJson(kind, value) + "\n```";
}
