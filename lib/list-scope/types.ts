/**
 * Moved to `@ai-matrx/records/list` (P16). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  ADMIN_SUPPORT_LIST_SCOPES,
  ALL_LANE_MEMBERS,
  DEFAULT_LIST_SCOPE,
  LIST_SCOPE_KINDS,
  PERSONAL_SEAT_SCOPES,
  declaredAbsentLanes,
  isAllScope,
  isIndustryScope,
  isMineScope,
  isOrgsScope,
  isPublicScope,
  isSharedScope,
  isSystemScope,
  isTeamScope,
  listOrgParam,
  makeScope,
  scopeIndustryId,
  scopeKey,
  scopeNarrowId,
  withAllScope,
  withStandardLanes,
  withTeamScope,
} from "@ai-matrx/records/list";
export type {
  DeclarableLane,
  LaneSupport,
  ListScope,
  ListScopeKind,
  StandardLanesOptions,
} from "@ai-matrx/records/list";
