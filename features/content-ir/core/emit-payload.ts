/**
 * The forward composer: given a kind's stored example, produce the EMIT/RENDER
 * payload — `{ "__kind": <slug>, ...data }`.
 *
 * Since 2026-08-23 stored examples and instances ALREADY carry their marker
 * (`__kind` is part of the data — KINDS_EVERYWHERE_PLAN §4.2), so for a
 * well-formed row this is an IDENTITY with a guarantee attached: the marker is
 * the FIRST key and it names the right slug. It stays because it is also the
 * repair for the legacy rows and hand-typed values that do not, and because a
 * caller wanting a copy-ready render payload should not have to know which it
 * has.
 *
 * Scalars/arrays are returned unchanged — for those kinds the identity travels
 * out of band (`root.kind`); there is no key to add.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";

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
