/**
 * features/review-walk/types.ts
 *
 * Every wire shape is DERIVED from the generated OpenAPI contract
 * (`types/python-generated/api-types.ts`) — never hand-mirrored. When the
 * backend's `aidream/services/review_descend/types.py` changes and
 * `pnpm sync-types` regenerates, every drifted consumer here lights up red.
 */
import type { components } from "@/types/python-generated/api-types";

export type DescendOut = components["schemas"]["DescendOut"];
export type DescendUnit = components["schemas"]["DescendUnit"];
export type DescendProducer = components["schemas"]["DescendProducer"];
export type DescendInput = components["schemas"]["DescendInput"];
export type DescendRef = components["schemas"]["DescendRef"];
export type ProducerRef = components["schemas"]["ProducerRef"];
export type WalkHop = components["schemas"]["WalkHop"];
export type FindingFromWalkRequest =
  components["schemas"]["FindingFromWalkRequest"];
export type FindingFromWalkOut = components["schemas"]["FindingFromWalkOut"];

/**
 * Unit kinds the walk can descend into. `wf_node_outcome` joined on
 * 2026-08-17, when C-30's per-step input capture let the server serve a
 * workflow step's real arguments instead of a 422 — so this is now exactly the
 * server's own `UnitKind`, derived rather than restated.
 */
export type WalkUnitKind = NonNullable<DescendRef["unit_kind"]>;

export type WalkLever = NonNullable<FindingFromWalkRequest["lever"]>;

/** One layer of the walk as held in window state. */
export interface WalkLayer {
  unitKind: WalkUnitKind;
  unitId: string;
  status: "loading" | "loaded" | "error";
  out: DescendOut | null;
  /** HTTP status of a failed descend (404 uncapturable, 422 not-yet-walkable). */
  errorStatus: number | null;
  /** Human-readable server explanation of why descent stopped. */
  errorDetail: string | null;
}

/** One recorded human answer; index in the array IS the hop number. */
export interface RecordedHop {
  unitKind: string;
  unitId: string;
  answer: "input_wrong" | "inputs_fine";
  note: string | null;
  snapshotId: string | null;
}
