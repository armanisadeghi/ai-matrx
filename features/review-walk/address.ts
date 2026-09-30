/**
 * features/review-walk/address.ts — the review walk's two identities, in ONE
 * place so the opener, the URL hydrator and the window can never drift apart.
 *
 * - **Instance id** `review-walk|<unitKind>|<unitId>` — the overlay instance and
 *   window-manager id. Deterministic per walked unit, so opening the same unit
 *   twice focuses the existing window instead of stacking a duplicate, and a
 *   refresh restores the window under the same id.
 * - **Address** `?panels=review_walk:<unitKind>.<unitId>` — the deep link. The
 *   `.` joiner mirrors `detail:<type>.<id>`; neither the `?panels=` token
 *   separators (`,` `:`) nor the arg separators (`_` `-`) may appear in the id
 *   slot's *joiner*, and a unit kind never contains a `.`.
 *
 * Pure module: no React, no Redux — safe to import from boot code
 * (`url-sync/initUrlHydration.ts`).
 */
import type { WalkUnitKind } from "./types";

/** The `?panels=` type key. Declared on the registry row as `urlSync.key`. */
export const REVIEW_WALK_URL_KEY = "review_walk" as const;

/** Every unit kind the walk (and the server's `/review/descend`) accepts. */
const UNIT_KIND_SET = {
  assistant_message: true,
  agent_request: true,
  wf_node_outcome: true,
} as const satisfies Record<WalkUnitKind, true>;

/** Exhaustive by construction: a new server `UnitKind` fails type-check above. */
export const WALK_UNIT_KINDS = Object.keys(UNIT_KIND_SET) as WalkUnitKind[];

export function isWalkUnitKind(value: unknown): value is WalkUnitKind {
  return (
    typeof value === "string" &&
    (WALK_UNIT_KINDS as readonly string[]).includes(value)
  );
}

export interface WalkUnitRef {
  unitKind: WalkUnitKind;
  unitId: string;
}

export function reviewWalkInstanceId(ref: WalkUnitRef): string {
  return `review-walk|${ref.unitKind}|${ref.unitId}`;
}

/** The id slot of the `?panels=review_walk:<id>` token. */
export function reviewWalkUrlId(ref: WalkUnitRef): string {
  return `${ref.unitKind}.${ref.unitId}`;
}

/**
 * Parse the id slot of a `review_walk` token. Returns null for anything that
 * does not name a known unit kind AND a non-empty unit id — half an identity
 * has nothing to walk.
 */
export function parseReviewWalkUrlId(id: string | null | undefined): WalkUnitRef | null {
  if (!id) return null;
  const dot = id.indexOf(".");
  if (dot <= 0 || dot === id.length - 1) return null;
  const unitKind = id.slice(0, dot);
  const unitId = id.slice(dot + 1);
  if (!isWalkUnitKind(unitKind)) return null;
  if (/[,:]/.test(unitId)) return null;
  return { unitKind, unitId };
}
