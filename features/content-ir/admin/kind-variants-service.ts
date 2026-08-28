"use client";

/**
 * Browser read/write for `content_ir.kind_definition.variants` — the kind's
 * NAMED PRESENTATION VARIANTS (INPUT-SURFACE.md §Presentation variants).
 *
 * Same shape as `studio/kind-examples.ts`: one RLS-scoped fetch through the
 * browser client, no server round-trip, no fork of the shape-doctor gather
 * (that RPC serves the status board and has no business carrying an authoring
 * surface's editable column).
 *
 * Writes touch `variants` and NOTHING else — no `is_active` (gated by
 * `content_ir.set_kind_activation`), no schema columns (they trigger example
 * and instance revalidation). Registering a rendering must never disturb a
 * kind's contract.
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  parseKindVariants,
  serializeKindVariants,
  type KindPresentationVariant,
} from "@/features/content-ir/variants/kind-variants";

/** Load the kind's registered variants. Throws loudly; the tab renders the message. */
export async function loadKindVariants(
  kindDefinitionId: string,
): Promise<KindPresentationVariant[]> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("variants")
    .eq("id", kindDefinitionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load the kind's variants: ${error.message}`);
  }
  if (!data) throw new Error("This kind no longer exists.");
  return parseKindVariants(data.variants);
}

/**
 * Replace the kind's whole variant set. The set is small and edited as a
 * whole, so a whole-column write is the honest operation — there is no
 * per-variant row to patch, and read-modify-write of a jsonb array element
 * would invent a second concurrency story for no gain.
 */
export async function saveKindVariants(
  kindDefinitionId: string,
  variants: KindPresentationVariant[],
): Promise<KindPresentationVariant[]> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .update({ variants: serializeKindVariants(variants) as unknown as Json })
    .eq("id", kindDefinitionId)
    .is("deleted_at", null)
    .select("variants")
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to save the kind's variants: ${error.message}`);
  }
  if (!data) {
    throw new Error("This kind no longer exists, or is not editable by you.");
  }
  return parseKindVariants(data.variants);
}
