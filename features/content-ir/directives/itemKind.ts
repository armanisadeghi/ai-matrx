/**
 * THE DIRECTIVE⇄KIND SEAM, client side.
 *
 * Arman, 2026-08-26: the envelope / Matrx-Actions system and the Shape (kind)
 * system must be ONE system with several methods inside it — not two systems
 * that happen to share a `__kind` key. They meet at the ITEM.
 *
 * A directive is a CONTAINER (`{__kind: "directive_v1_<class>_<noun>", items}`).
 * Its items are the payload, and when the server's item model is already a
 * `KindModel`, that payload IS a registered kind instance — so the kind system
 * already knows how to validate it, render it through its own component, and
 * copy it. This module is the lookup that lets a renderer ask "what kind is one
 * of these items?" and then hand the answer to the kind pipeline.
 *
 * The map is SERVER-DERIVED (`ShapeSpec.item_kind` → the published catalog
 * manifest → `catalog-nouns.generated.ts`). Nothing is authored on this side,
 * so a shape that becomes kind-backed tomorrow is folded in with zero frontend
 * edits — the same "register once, works everywhere" promise the prefix rule
 * makes for renderers.
 *
 * `null` is HONEST, never a gap-filler: an item model that is a plain Pydantic
 * shape has no kind, no schema and no component, so a consumer must degrade to
 * the generic structured viewer instead of inventing one. The set of nulls IS
 * the burndown list for folding the remaining shapes in.
 */

import { DIRECTIVE_ITEM_KINDS } from "@/features/matrx-envelope/catalog-nouns.generated";

/** The content-IR kind ONE item of this directive is, or null when it has none. */
export function directiveItemKind(slug: string): string | null {
  const kind = (DIRECTIVE_ITEM_KINDS as Record<string, string | undefined>)[slug];
  return typeof kind === "string" && kind ? kind : null;
}

/**
 * The item, presented the way the kind pipeline expects it: `__kind` first so a
 * consumer types the object from its own first key, exactly like every other
 * kind instance on the wire. Returns null when the shape has no item kind —
 * the caller then owns the generic-viewer fallback.
 *
 * `__kind` is ADDED, never overwritten: an item that already carries its marker
 * (the one-shape doctrine) keeps the value it was emitted with.
 */
export function asKindInstance(
  slug: string,
  item: Record<string, unknown>,
): Record<string, unknown> | null {
  const kind = directiveItemKind(slug);
  if (!kind) return null;
  const existing = item.__kind;
  return { __kind: typeof existing === "string" && existing ? existing : kind, ...item };
}
