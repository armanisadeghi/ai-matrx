/**
 * conversation-history — reusable, scope-keyed conversation sidebar slice.
 *
 * Ships alongside `conversation-list`:
 * - `conversation-list` owns per-agent RPC caches (used by the Runner) and
 *   the global user list.
 * - `conversation-history` owns feature-scoped, multi-agent, paginated
 *   views (used by the /code workspace and future consumers).
 *
 * Pattern:
 *   dispatch(fetchConversationHistory({ scopeId, agentIds, replace: true }))
 *   dispatch(fetchConversationHistory({ scopeId, replace: false }))  // load more
 *   useAppSelector(makeSelectGroupedByDate(scopeId))
 */

export * from "./slice";
export * from "./selectors";
export * from "./thunks";
export * from "./types";
