// features/scopes/service/associationCandidates.ts
//
// HOST WIRING (W5 swap, 2026-08-29): candidate reads (the ONE
// `reference_search_candidates` RPC) + the universal cross-token search live
// in `@ai-matrx/associations/core` (createCandidatesService — registry
// predicates, per-token overrides, capped fan-out). Bound here to the host
// store under the historical free-function names.

import type {
  ListCandidatesArgs,
  SearchAcrossTokensArgs,
} from "@ai-matrx/associations/core";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export type {
  CandidateRecord,
  CandidatesResult,
  ListCandidatesArgs,
  SearchAcrossTokensArgs,
  UniversalCandidate,
} from "@ai-matrx/associations/core";

export function listAssociationCandidates(args: ListCandidatesArgs) {
  return getAssociationsStore().candidates.listAssociationCandidates(args);
}

export function searchCandidatesAcrossTokens(args: SearchAcrossTokensArgs) {
  return getAssociationsStore().candidates.searchCandidatesAcrossTokens(args);
}
