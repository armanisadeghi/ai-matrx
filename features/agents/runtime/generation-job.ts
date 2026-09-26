// features/agents/runtime/generation-job.ts
//
// Which generation JOB (image / video / audio) a conversation's next run is,
// read from Redux at send time. The ordinary run path (`executeInstance`,
// /agents/[id]/run and every chat) never labelled its request as a job, so a
// multi-minute video render showed the generic "Processing…" shimmer and the
// job card (model · clock · estimated cost) never appeared — only the
// builder's manual path set it. Both paths now label the request the same way.

import type { RootState } from "@/lib/redux/store";
import {
  fetchModelById,
  selectModelById,
} from "@/features/ai-models/redux/modelRegistrySlice";
import type { AppDispatch } from "@/lib/redux/store";
import { setRequestGenerationJob } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { selectCurrentSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { isJobOutputKind, runOutputKindFromModalities } from "@/lib/api/run-wait";
import type { RequestGenerationJob } from "@/features/agents/types/request.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The model this conversation's next run uses: a run-time model override
 *  wins, else the agent's own model. Null when neither is known. */
export function selectRunModelId(
  state: RootState,
  conversationId: string,
): string | null {
  const settings = selectCurrentSettings(conversationId)(state) as
    | Record<string, unknown>
    | undefined;
  const override = settings?.model;
  if (typeof override === "string" && UUID.test(override)) return override;
  const instance = state.conversations.byConversationId[conversationId];
  const sourceId = instance?.initialAgentVersionId ?? instance?.agentId;
  if (!sourceId) return null;
  return state.agentDefinition.agents?.[sourceId]?.modelId ?? null;
}

/**
 * The job this run is, or null for a text run or when the model is not in the
 * loaded catalog yet (see `labelGenerationJob`, which loads it).
 */
export function resolveGenerationJob(
  state: RootState,
  conversationId: string,
): RequestGenerationJob | null {
  const modelId = selectRunModelId(state, conversationId);
  if (!modelId) return null;
  const model = selectModelById(state, modelId);
  if (!model?.capabilities) return null;
  const kind = runOutputKindFromModalities(
    parseCapabilities(model.capabilities, {
      modelId: model.id,
      modelName: model.name,
    }).output,
  );
  if (!isJobOutputKind(kind)) return null;
  return {
    kind: kind as RequestGenerationJob["kind"],
    modelLabel: model.common_name?.trim() || model.name?.trim() || null,
    firstResponseSeconds: null,
  };
}

/**
 * Label a request as a generation job. The model catalog is NOT loaded on
 * every surface (/agents/[id]/run never loads it), so a model missing from the
 * registry is fetched first — off the send path: the request is already on its
 * way, and the label lands a moment later.
 */
export async function labelGenerationJob(
  dispatch: AppDispatch,
  getState: () => RootState,
  requestId: string,
  conversationId: string,
): Promise<void> {
  const modelId = selectRunModelId(getState(), conversationId);
  if (!modelId) return;
  if (!selectModelById(getState(), modelId)) {
    try {
      await dispatch(fetchModelById(modelId));
    } catch (err) {
      console.warn(
        "[generation-job] could not load the model to label this run; the generic working line stays",
        { modelId, err },
      );
      return;
    }
  }
  const job = resolveGenerationJob(getState(), conversationId);
  if (job) dispatch(setRequestGenerationJob({ requestId, job }));
}
