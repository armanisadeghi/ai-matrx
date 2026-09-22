/**
 * `catWriteArgs` — the ONE way this app builds a call to `public.cat_write`.
 *
 * WHY IT EXISTS. `platform` is not a client-writable schema (chair ruling, VERIFIER-8 HIGH-3),
 * so every categories write in this app goes through `public.cat_write` / `public.cat_archive`.
 * Five files and thirteen call sites do that, and two things about the door's shape are easy to
 * get subtly wrong at each one:
 *
 * 🚨 **THE DOOR IS A PATCH, AND "NOT MENTIONED" IS NOT "SET TO NULL".** Every optional column
 * carries its own `p_set_*` flag precisely so that changing a name cannot erase a colour the
 * caller never mentioned — which is what the older `public.cat_update` does, and what several of
 * these call sites were working around by hand. The flag says "I am writing this column"; the
 * value says what to write. Omitting the value while setting the flag writes NULL, which is how
 * a caller CLEARS an icon or a parent. This module makes that the only way to express it:
 * `undefined` in the patch means untouched, `null` means cleared.
 *
 * 🚨 **`metadata` MERGES.** `p_metadata_patch` is merged into the column top-level inside the
 * database. A caller sends only the keys it owns — never a read-modify-write of the whole
 * column, which is what `components/admin/ContentBlocksManager.tsx` did when it wrote
 * `{ is_active }` over the jsonb and wiped `legacy_table` with it, and what
 * `features/skills/redux/skillsThunks.ts` admitted in a comment was "a race".
 *
 * It also settles a typing detail once: the generated `Args` type for a door marks every
 * defaulted plpgsql parameter OPTIONAL and non-nullable, because a defaulted parameter is
 * ABSENT from the call rather than explicitly NULL. So a null is expressed as "flag set, value
 * omitted", which is exactly what the door reads.
 */

import type { Database } from "@/types/database.types";

export type CatWriteArgs = Database["public"]["Functions"]["cat_write"]["Args"];

/**
 * What a caller wants to change. `undefined` means UNTOUCHED; `null` means CLEARED. That
 * distinction is the whole contract, and it is why this is not a plain object spread.
 */
export interface CategoryPatch {
  name?: string;
  slug?: string | null;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  position?: number | null;
  placementType?: string | null;
  /** Only the keys this caller owns. The door merges them; it never replaces the column. */
  metadata?: Record<string, unknown>;
}

export interface CategoryTarget {
  /** Omit to CREATE. */
  id?: string;
  /** Required on a create; unreachable on an update, by the door's design. */
  organizationId?: string;
  /** Platform vocabulary. Super-admin only, refused by the door otherwise. */
  isSystem?: boolean;
}

export function catWriteArgs(
  dimension: string,
  patch: CategoryPatch,
  target: CategoryTarget = {},
): CatWriteArgs {
  const args: CatWriteArgs = { p_dimension: dimension };
  if (target.id !== undefined) args.p_category_id = target.id;
  if (target.organizationId !== undefined)
    args.p_organization_id = target.organizationId;
  if (target.isSystem !== undefined) args.p_is_system = target.isSystem;

  if (patch.name !== undefined) args.p_name = patch.name;
  // For each of these: the FLAG says "I am writing this column", and an omitted value
  // writes NULL — which is how a caller clears one.
  if (patch.slug !== undefined) {
    args.p_set_slug = true;
    if (patch.slug !== null) args.p_slug = patch.slug;
  }
  if (patch.parentId !== undefined) {
    args.p_set_parent = true;
    if (patch.parentId !== null) args.p_parent_id = patch.parentId;
  }
  if (patch.color !== undefined) {
    args.p_set_color = true;
    if (patch.color !== null) args.p_color = patch.color;
  }
  if (patch.icon !== undefined) {
    args.p_set_icon = true;
    if (patch.icon !== null) args.p_icon = patch.icon;
  }
  if (patch.position !== undefined) {
    args.p_set_position = true;
    if (patch.position !== null) args.p_position = patch.position;
  }
  if (patch.placementType !== undefined) {
    args.p_set_placement_type = true;
    if (patch.placementType !== null) args.p_placement_type = patch.placementType;
  }
  if (patch.metadata !== undefined)
    args.p_metadata_patch = patch.metadata as CatWriteArgs["p_metadata_patch"];
  return args;
}

/**
 * The door returns the WHOLE row as jsonb, because every column of a category is somebody's.
 * A caller that wants its own narrower projection casts here, once, instead of at each call
 * site — and this NARROWS NOTHING and VALIDATES NOTHING: a door returning the wrong shape
 * would be a defect in the door, and this must never grow a tolerant read that hides one.
 */
export function categoryRow<Row>(data: unknown): Row | null {
  return (data ?? null) as Row | null;
}
