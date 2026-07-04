/**
 * Discriminator abstraction — how a node's kind is established from the wire.
 *
 * The parser never hardcodes "kind comes from a JSON key". JSON resolves via
 * the `__kind` field (implemented today); XML resolves via tag → registry
 * alias (Phase 6 — contract only). `IrStructuredNode.discriminator` records
 * which resolver produced each node so renderers and round-trip serializers
 * can reconstruct the original wire format per node.
 */

import type { IrDiscriminator } from "./ir-types";
import { KIND_KEY } from "./kind-schema.types";

export const JSON_DISCRIMINATOR: IrDiscriminator = {
  format: "json",
  key: KIND_KEY,
};

export function xmlDiscriminator(tag: string): IrDiscriminator {
  return { format: "xml", tag };
}

/** What a resolver can say about an opening compound value. */
export type KindResolution =
  | { outcome: "kind"; kind: string }
  | { outcome: "pending" }
  | { outcome: "raw"; reason: string };
