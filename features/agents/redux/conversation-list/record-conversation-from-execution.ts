/**
 * Stream-side helper — builds an upsert action for a just-created conversation
 * so it lands in the per-agent list caches (and the canonical "all" cache)
 * without a round-trip to the server.
 *
 * Port of `agent-conversations/record-agent-conversation-from-execution.ts`
 * onto the unified `conversationList` slice. The function signature is
 * preserved so the stream processor can switch imports without rewriting
 * call sites.
 */

import type { RootState } from "@/lib/redux/store";
import type { ConversationListItem } from "./conversation-list.types";
import { conversationListCacheKey } from "./conversation-list.types";
import { upsertConversationInCaches } from "./conversation-list.slice";

/**
 * Builds a list row from execution context. Uses canonical agx_agent.id for
 * cache keys (version snapshots use parentAgentId).
 */
export function buildConversationListItemFromExecution(
  state: RootState,
  instanceId: string,
  conversationId: string,
  overrides?: Partial<ConversationListItem>,
): {
  row: ConversationListItem;
  canonicalAgentId: string;
  /** Version-scoped caches to update (in addition to the `::all` list). */
  alsoTouchVersionFilters: number[];
} | null {
  const instance = state.conversations.byConversationId[instanceId];
  if (!instance) return null;

  const agent = state.agentDefinition.agents?.[instance.agentId];
  const canonicalAgentId =
    agent?.parentAgentId ?? agent?.id ?? instance.agentId;

  const hist = state.messages.byConversationId[instanceId];
  const now = new Date().toISOString();

  const alsoTouchVersionFilters: number[] =
    agent?.isVersion === true && typeof agent.version === "number"
      ? [agent.version]
      : [];

  const row: ConversationListItem = {
    conversationId,
    title: overrides?.title ?? hist?.title ?? "",
    description:
      overrides?.description ??
      (hist?.description != null ? hist.description : ""),
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    status: overrides?.status ?? "active",
    messageCount: overrides?.messageCount ?? 1,
    isFavorite: overrides?.isFavorite ?? false,
    excludeFromKg: overrides?.excludeFromKg ?? false,
    agentVersionNumber: overrides?.agentVersionNumber ?? agent?.version ?? 0,
    initialAgentVersionId:
      overrides?.initialAgentVersionId ??
      (agent?.isVersion === true ? agent.id : ""),
    lastModelId: overrides?.lastModelId ?? agent?.modelId ?? "",
    sourceApp: overrides?.sourceApp ?? instance.sourceApp,
    sourceFeature: overrides?.sourceFeature ?? instance.sourceFeature,
  };

  return { row, canonicalAgentId, alsoTouchVersionFilters };
}

/**
 * Returns a Redux action to merge the new conversation into the
 * `conversationList` slice (entity store + per-agent caches). Returns null
 * if the instance isn't in state. Dispatch from thunks / stream processor.
 */
export function upsertConversationFromExecutionAction(
  state: RootState,
  instanceId: string,
  conversationId: string,
  overrides?: Partial<ConversationListItem>,
): ReturnType<typeof upsertConversationInCaches> | null {
  const built = buildConversationListItemFromExecution(
    state,
    instanceId,
    conversationId,
    overrides,
  );
  if (!built) return null;

  const allKey = conversationListCacheKey(built.canonicalAgentId, null);
  const versionKeys = built.alsoTouchVersionFilters.map((v) =>
    conversationListCacheKey(built.canonicalAgentId, v),
  );

  const cacheIdentities: Record<
    string,
    { agentId: string; versionFilter: number | null }
  > = {
    [allKey]: { agentId: built.canonicalAgentId, versionFilter: null },
  };
  for (const v of built.alsoTouchVersionFilters) {
    cacheIdentities[conversationListCacheKey(built.canonicalAgentId, v)] = {
      agentId: built.canonicalAgentId,
      versionFilter: v,
    };
  }

  return upsertConversationInCaches({
    cacheKeys: [allKey, ...versionKeys],
    row: built.row,
    cacheIdentities,
  });
}

/** @deprecated Legacy name. Prefer `upsertConversationFromExecutionAction`. */
export const upsertAgentConversationFromExecutionAction =
  upsertConversationFromExecutionAction;

/** @deprecated Legacy name. Prefer `buildConversationListItemFromExecution`. */
export const buildAgentConversationListItemFromExecution =
  buildConversationListItemFromExecution;
