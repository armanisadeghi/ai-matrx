/**
 * Type-level helpers over the generated kind artifact
 * (`generated/kinds.generated.ts`). This file carries NO payload shapes — it
 * only describes how a consumer reads one. Every payload shape in this repo
 * comes from the registry via `pnpm shape:types`; a hand-written twin is a
 * defect the `check:kind-type-twins` gate fails on.
 *
 * Why `PartialKind` exists: a streaming kind value is a valid, closed JSON
 * partial — fields that have arrived are correctly typed, fields that have not
 * are simply absent (STREAMING_PARTIAL_KINDS.md). That is exactly a recursive
 * `Partial`, and it is what every renderer should type its input as until the
 * envelope reports `status === "complete"`.
 */

import type {
  GeneratedKindSlug,
  KindPayload,
} from "./generated/kinds.generated";

export type {
  GeneratedKindSlug,
  KindPayload,
  KindPayloadBySlug,
} from "./generated/kinds.generated";
export {
  GENERATED_KIND_SLUGS,
  KIND_REGISTRY_FINGERPRINT,
  isGeneratedKindSlug,
} from "./generated/kinds.generated";

/** Primitives that must not be recursed into. */
type Leaf = string | number | boolean | null | undefined;

/**
 * A mid-stream view of a complete kind instance: every field optional, all the
 * way down, with the field TYPES still enforced. `PartialKind<WebResult>` is
 * what a renderer sees while the object is still arriving.
 */
export type PartialKind<T> = T extends Leaf
  ? T
  : T extends (infer U)[]
    ? PartialKind<U>[]
    : T extends object
      ? { [K in keyof T]?: PartialKind<T[K]> }
      : T;

/** The streaming view of a registered kind, by slug. */
export type PartialKindPayload<S extends GeneratedKindSlug> = PartialKind<
  KindPayload<S>
>;
