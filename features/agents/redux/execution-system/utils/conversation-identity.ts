/**
 * conversation-identity — the ONE builder for a turn's request identity block.
 *
 * Every outbound agent turn (turn 1, continuation, manual send, delegated-tool
 * RESUME) must carry the same identity fields, captured the same way:
 * `organization_id`, `project_id`, `task_id`, `scope_ids`, `source_app`,
 * `source_feature`. The server tracks these per turn on
 * `chat.conversation.metadata.last_request_context` and emits a
 * `request_context_changed` stream warning when any of them drifts — so a path
 * that hand-rolls its own subset IS the bug. The resume thunk used to omit
 * `source_app`/`source_feature`, the server fabricated
 * `source_feature="conversation_resume"` for that turn, and every delegated
 * resume + the following turn warned forever ('agent-runner' ↔
 * 'conversation_resume' ping-pong).
 *
 * Precedence rules (identical for every caller):
 *   - ORG IS THE ONE FIELD AMBIENT STATE DOES NOT OWN. A conversation's org is
 *     decided at creation and never moves; once the instance record carries one
 *     (hydrated from `chat.conversation.organization_id`), it wins. Ambient
 *     appContext is the source only for a brand-new conversation.
 *   - project/task/scope_ids are per-turn picker state from appContextSlice.
 *   - source_app/source_feature come from the instance — stamped at instance
 *     creation and stable for the conversation's lifetime on this surface.
 */

import type { RootState } from "@/lib/redux/store";
import type {
  SourceAppValue,
  SourceFeatureValue,
} from "@/features/agents/types/instance.types";
import {
  selectEffectiveOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";

export interface ConversationIdentity {
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  scope_ids: string[];
  source_app?: SourceAppValue;
  source_feature?: SourceFeatureValue;
}

export function buildConversationIdentity(
  state: RootState,
  conversationId: string,
  opts?: {
    /**
     * Pre-resolved scope set for THIS send (from the chat↔scope mismatch gate
     * in smartExecute). When present it replaces the active-selection read —
     * the gate has already reconciled the sidebar selection with the
     * conversation's durable tags.
     */
    scopeIdsOverride?: string[];
  },
): ConversationIdentity {
  const instance = state.conversations.byConversationId[conversationId];

  const organization_id =
    instance?.organizationId ??
    selectEffectiveOrganizationId(state) ??
    undefined;
  const project_id = selectProjectId(state) ?? undefined;
  const task_id = selectTaskId(state) ?? undefined;
  const scope_ids =
    opts?.scopeIdsOverride ??
    Object.values(selectScopeSelectionsContext(state) ?? {}).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );

  return {
    organization_id,
    project_id,
    task_id,
    scope_ids,
    source_app: instance?.sourceApp || undefined,
    source_feature: instance?.sourceFeature || undefined,
  };
}

/**
 * Spread-ready wire fields — only set values ride; empty scope_ids omitted.
 * Use as `{ ...identityWireFields(identity) }` when assembling a body.
 */
export function identityWireFields(
  identity: ConversationIdentity,
): Record<string, unknown> {
  return {
    ...(identity.organization_id && {
      organization_id: identity.organization_id,
    }),
    ...(identity.project_id && { project_id: identity.project_id }),
    ...(identity.task_id && { task_id: identity.task_id }),
    ...(identity.scope_ids.length > 0 && { scope_ids: identity.scope_ids }),
    ...(identity.source_app && { source_app: identity.source_app }),
    ...(identity.source_feature && {
      source_feature: identity.source_feature,
    }),
  };
}
