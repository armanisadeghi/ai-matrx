// features/scopes/service/associationEdges.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the content/structure edge classifier
// (`isContentSourceEdge` — THE one predicate; never write a per-consumer
// whitelist of source tokens) lives in `@ai-matrx/associations/core`.
// Pure functions — direct re-export.

export {
  NON_CONTENT_SOURCE_TYPES,
  isContentSourceEdge,
  isMembershipMetadata,
} from "@ai-matrx/associations/core";
