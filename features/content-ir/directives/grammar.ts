/**
 * Kind Directives — the grammar, the shell, and the position law (TS mirror).
 *
 * ONE system (Arman, 2026-08-23): the Matrx Envelope/Directive protocol and the
 * Content IR kind system were *"always meant to be just one system"*. This file
 * is the client half of `aidream packages/matrx-graph/matrx_graph/content_ir/
 * directives.py` — a PURE mirror. No I/O, no React, no Supabase, so the grammar
 * parses anywhere a kind does.
 *
 * 🚨 IT MAY NOT DRIFT FROM THE SERVER. `docs/protocol/kind_directive_grammar.
 * generated.json` is the byte-checked mirror of the Python constants, generated
 * by `pnpm sync:directive-grammar`; `directive-grammar-parity.test.ts` asserts
 * every constant below against it (offline, so it runs in CI), and
 * `pnpm check:directive-grammar` re-derives the JSON from a live aidream
 * checkout. Change the Python first, regenerate, then change this.
 *
 * Source of record: `docs/protocol/KIND_DIRECTIVES.md`; doctrine:
 * `common-docs/policies/strictness-law.md`.
 *
 * THE WIRE SHAPE
 * --------------
 *     { "__kind": "directive_v1_create_task", "items": [ { ...one item... } ] }
 *
 * Two keys, and `__kind` is the FIRST one. That is not cosmetic: an unfenced
 * JSON document is typed early by its first key alone, so a directive with
 * `__kind` first routes through the SAME skeleton→fill→component path as every
 * other kind instance. `items` stays because batch semantics are load-bearing —
 * the per-item ledger, the per-item receipt, and partial-batch retry key on it.
 *
 * THE SLUG GRAMMAR — a routing language
 * -------------------------------------
 * `directive_v<version>_<class>_<noun>`
 *
 * `directive_v` is RESERVED: a hand-authored or user-created kind may never
 * start with it, which is why the kind `transcript` and the directive
 * `directive_v1_reference_transcript` cannot collide. `<class>` comes from a
 * CLOSED vocabulary, which is what makes parsing unambiguous even though nouns
 * contain underscores: the class is always the first `_`-delimited token after
 * the prefix, so `directive_v1_reference_create_task` is unambiguously
 * `(reference, "create_task")`.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";

export { KIND_KEY };

/**
 * The reserved slug prefix. ANY kind slug starting with this belongs to the
 * Kind Directives protocol; nothing else may claim one.
 */
export const RESERVED_PREFIX = "directive_v" as const;

/** Current directive grammar version. */
export const DIRECTIVE_VERSION = 1 as const;

/** The full prefix of a v1 directive slug. */
export const SLUG_PREFIX = `${RESERVED_PREFIX}${DIRECTIVE_VERSION}_` as const;

/** The CLOSED class vocabulary. Closed is what makes the grammar parseable. */
export const CLASSES = [
  "reference",
  "view",
  "create",
  "update",
  "delete",
  "action",
  "validation",
  "secret",
] as const;

export type DirectiveClass = (typeof CLASSES)[number];

export type DirectiveCapability = "pure" | "sensitive" | "side_effect";

/**
 * class → capability (the safety/lifecycle contract). DERIVED, never stored on
 * a shape: a shape's capability is a fact about its class, and a second copy is
 * a second thing to drift.
 */
export const CAPABILITY_BY_CLASS: Readonly<
  Record<DirectiveClass, DirectiveCapability>
> = {
  reference: "pure", // resolve/render on read; mutates nothing
  view: "pure", // an open-this affordance; a read, resolved by the client
  validation: "pure", // returns a verdict; mutates nothing
  secret: "sensitive", // resolved only for the model; redacted on store
  create: "side_effect", // executes once, server-side; auth + idempotency
  update: "side_effect",
  delete: "side_effect",
  action: "side_effect", // a named, registered procedure (a Kind Action)
};

/** The classes that EXECUTE at an agent's output root — a durable side effect. */
export const SIDE_EFFECT_CLASSES: ReadonlySet<DirectiveClass> = new Set(
  CLASSES.filter((c) => CAPABILITY_BY_CLASS[c] === "side_effect"),
);

/**
 * The classes that resolve to a LIVE VALUE inside content (prose / a ```matrx
 * fence) — a pointer or a sensitive value.
 *
 * STRICT BY CHOICE, mirroring the server: exactly `reference` + `secret`.
 * `view` is pure and could plausibly read as in-content, but nothing registers
 * a `view` shape today and widening a position gate no caller needs is the
 * "little bit of breathing room" THE STRICTNESS LAW forbids.
 */
export const IN_CONTENT_CLASSES: ReadonlySet<DirectiveClass> = new Set<DirectiveClass>(
  ["reference", "secret"],
);

/** A parsed directive slug. `slug` round-trips through `buildDirectiveSlug`. */
export interface DirectiveSlug {
  slug: string;
  version: number;
  directiveClass: DirectiveClass;
  noun: string;
  capability: DirectiveCapability;
  /** Executes at an agent's output root (THE position law, half one). */
  executes: boolean;
  /** Resolves to a live value inside content (THE position law, half two). */
  inContent: boolean;
}

export function isDirectiveClass(value: unknown): value is DirectiveClass {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CAPABILITY_BY_CLASS, value)
  );
}

/**
 * Whether `slug` sits in the reserved Kind Directives namespace.
 *
 * Deliberately broader than {@link parseDirectiveSlug}: a MALFORMED
 * `directive_v…` slug is still reserved, so authoring gates reject it instead
 * of letting a near-miss through as an ordinary kind.
 *
 * The gates that consume this: the FE shape-authoring path
 * (`features/agents/components/schema-proposal/create-shape.ts` —
 * `isValidKindSlug`, `buildShapePlan`, and a write-time belt in
 * `createShapeFromPlan`) and, server-side, aidream's `ShapeSpec` registrar.
 */
export function isReservedDirectiveSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.startsWith(RESERVED_PREFIX);
}

/** A noun/token: starts with a lowercase letter, then `[a-z0-9_]`. */
function isToken(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

/**
 * `("create", "task") → "directive_v1_create_task"`. THROWS on a class outside
 * the closed vocabulary or an ill-formed noun — a slug that cannot be parsed
 * back must never be mintable.
 */
export function buildDirectiveSlug(
  directiveClass: string,
  noun: string,
  version: number = DIRECTIVE_VERSION,
): string {
  if (!isDirectiveClass(directiveClass)) {
    throw new Error(
      `unknown directive class ${JSON.stringify(directiveClass)}; the vocabulary is CLOSED: ${CLASSES.join(", ")}.`,
    );
  }
  if (typeof noun !== "string" || !isToken(noun)) {
    throw new Error(
      `invalid directive noun ${JSON.stringify(noun)} for class ${JSON.stringify(directiveClass)}: a noun is lowercase [a-z0-9_], starts with a letter, and is non-empty.`,
    );
  }
  return `${RESERVED_PREFIX}${version}_${directiveClass}_${noun}`;
}

/**
 * Parse a directive slug, or `null` when `slug` is not one.
 *
 * `null` means "not a directive at all". A slug that IS in the reserved
 * namespace but does not parse returns `null` too — callers pair this with
 * {@link isReservedDirectiveSlug} when they need to tell "ordinary kind" apart
 * from "malformed directive", and every such caller treats the malformed case
 * as an ERROR, never as an ordinary kind.
 */
export function parseDirectiveSlug(slug: unknown): DirectiveSlug | null {
  if (!isReservedDirectiveSlug(slug)) return null;
  const rest = slug.slice(RESERVED_PREFIX.length);
  const firstSep = rest.indexOf("_");
  if (firstSep <= 0) return null;
  const versionDigits = rest.slice(0, firstSep);
  if (!/^[0-9]+$/.test(versionDigits)) return null;
  const remainder = rest.slice(firstSep + 1);
  const classSep = remainder.indexOf("_");
  if (classSep <= 0) return null;
  const directiveClass = remainder.slice(0, classSep);
  const noun = remainder.slice(classSep + 1);
  if (!isDirectiveClass(directiveClass) || !isToken(noun)) return null;
  return {
    slug,
    version: Number.parseInt(versionDigits, 10),
    directiveClass,
    noun,
    capability: CAPABILITY_BY_CLASS[directiveClass],
    executes: executesAtOutputRoot(directiveClass),
    inContent: resolvesInContent(directiveClass),
  };
}

export function capabilityOf(directiveClass: DirectiveClass): DirectiveCapability {
  return CAPABILITY_BY_CLASS[directiveClass];
}

/**
 * THE position law, half one: only a side-effect class executes at an agent's
 * output root. A reference or a secret there is inert data.
 */
export function executesAtOutputRoot(directiveClass: string): boolean {
  return isDirectiveClass(directiveClass) && SIDE_EFFECT_CLASSES.has(directiveClass);
}

/**
 * THE position law, half two: only a pointer or a sensitive value resolves to a
 * live value inside content. A side effect in prose is never executed.
 */
export function resolvesInContent(directiveClass: string): boolean {
  return isDirectiveClass(directiveClass) && IN_CONTENT_CLASSES.has(directiveClass);
}

/**
 * The `__kind` of `obj` when it is in the reserved namespace, else null.
 *
 * Reads the RESERVED namespace, not the parsed grammar, so a malformed
 * directive is still recognized as a directive (and rejected downstream with a
 * real message) rather than silently mistaken for an ordinary kind.
 */
export function directiveSlugOf(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const slug = (obj as Record<string, unknown>)[KIND_KEY];
  return isReservedDirectiveSlug(slug) ? slug : null;
}

/**
 * THE detector — a dict whose `__kind` is in the reserved namespace.
 *
 * Replaces `isMatrxEnvelope` (presence of `matrx_version`). One discriminator,
 * one namespace, and it is the same key every other kind instance carries.
 */
export function isKindDirective(obj: unknown): boolean {
  return directiveSlugOf(obj) !== null;
}

/**
 * The two-key shell, as it travels on the wire. A TYPE alias, not an interface,
 * so a shell is structurally assignable to `Record<string, unknown>` — every
 * render seam that takes "some decoded JSON object" accepts one without a cast.
 */
export type KindDirectiveShell<Item = Record<string, unknown>> = {
  /** The slug. Serialized FIRST — see the module doc. */
  [KIND_KEY]: string;
  items: Item[];
};

/**
 * Build the two-key shell with `__kind` FIRST. Never hand-assemble the object
 * literal elsewhere: JS preserves insertion order for string keys, and the
 * first-key rule is what lets the streaming detector type a directive early.
 */
export function buildKindDirective<Item>(
  slug: string,
  items: Item[],
): KindDirectiveShell<Item> {
  return { [KIND_KEY]: slug, items };
}
