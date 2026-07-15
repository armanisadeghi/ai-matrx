// features/agents/runtime/runtime-resolver.ts
//
// Resolves the (model + surface) → runtime decision in a single place
// the launcher can call early. Wraps three lookups + the pure
// `pickRuntime` resolver and returns either:
//   - { runtime } when the launcher should proceed,
//   - { error } when the (model, surface) combination is unworkable.
//
// Why a service-level helper (not a hook): the launcher is a Redux
// thunk, so we need a pure callable that reads Redux state + does
// optional DB lookups, returning a plain result. No React.
//
// Resolution order:
//   1. Read the target's model_id from Redux or the authoritative
//      agent.definition / agent.definition_version row.
//   2. Read and validate the model's `capabilities.interaction` from the
//      registry. If the model isn't cached yet, fetch ai.model_config.
//   3. Read the surface's `execution_mode` from ui_surface. We cache
//      a tiny per-surface result so launches stay fast.
//   4. Call `pickRuntime` and return.

import type { RootState } from "@/lib/redux/store";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  parseCapabilities,
  type ModelCapabilities,
} from "@/features/ai-models/capabilities/parse";
import { isInteractionMode } from "@/features/ai-models/capabilities/types";
import { createClient } from "@/utils/supabase/client";
import {
  pickRuntime,
  type ExecutionMode,
  type PickRuntimeResult,
} from "./pickRuntime";

interface ResolveAgentRuntimeOpts {
  /** Agent UUID. */
  agentId: string;
  /** Surface name (`ui_surface.name`) the agent is being launched from. */
  surfaceName: string | undefined;
  /** Optional per-launch override. */
  agentHint?: ExecutionMode | null;
}

/** Cache surface → execution_mode lookups. Cleared by tests. */
const surfaceModeCache = new Map<string, ExecutionMode>();

export function _clearSurfaceModeCacheForTesting(): void {
  surfaceModeCache.clear();
}

async function fetchSurfaceExecutionMode(
  surfaceName: string,
): Promise<ExecutionMode> {
  const cached = surfaceModeCache.get(surfaceName);
  if (cached) return cached;

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("ui")
    .from("ui_surface")
    .select("execution_mode")
    .eq("name", surfaceName)
    .maybeSingle();

  if (error) {
    // RLS or network — treat as the default, the launcher continues.
    return "python-stream";
  }
  // CHECK constraint guarantees this is one of the four allowed values;
  // narrow it for TypeScript.
  const mode = (data?.execution_mode ?? "python-stream") as ExecutionMode;
  surfaceModeCache.set(surfaceName, mode);
  return mode;
}

type LaunchModelSnapshot = {
  modelId: string;
  modelName: string;
  capabilities: ModelCapabilities;
};

function parseVerifiedCapabilities(
  raw: unknown,
  modelId: string,
  modelName: string,
): ModelCapabilities | null {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !isInteractionMode((raw as Record<string, unknown>).interaction)
  ) {
    return null;
  }

  return parseCapabilities(raw, { modelId, modelName });
}

async function resolveLaunchModelSnapshot(
  getState: () => RootState,
  targetId: string,
  isVersion: boolean,
): Promise<LaunchModelSnapshot | { error: string }> {
  const state = getState();
  let modelId = isVersion
    ? null
    : (state.agentDefinition.agents?.[targetId]?.modelId ?? null);

  if (!modelId) {
    const supabase = createClient();
    const targetResult = isVersion
      ? await supabase
          .schema("agent")
          .from("definition_version")
          .select("model_id")
          .eq("id", targetId)
          .maybeSingle()
      : await supabase
          .schema("agent")
          .from("definition")
          .select("model_id")
          .eq("id", targetId)
          .maybeSingle();

    if (targetResult.error || !targetResult.data?.model_id) {
      return {
        error:
          "Could not verify this agent's model capabilities. Refresh and try again.",
      };
    }
    modelId = targetResult.data.model_id;
  }

  const cachedModel = selectModelById(getState(), modelId);
  if (cachedModel) {
    const modelName = cachedModel.name ?? modelId;
    const capabilities = parseVerifiedCapabilities(
      cachedModel.capabilities,
      modelId,
      modelName,
    );
    if (!capabilities) {
      return {
        error: `Could not verify interaction capabilities for "${modelName}". Refresh and try again.`,
      };
    }
    return {
      modelId,
      modelName,
      capabilities,
    };
  }

  const supabase = createClient();
  const { data: model, error } = await supabase
    .schema("ai")
    .from("model_config")
    .select("id, name, capabilities")
    .eq("id", modelId)
    .maybeSingle();

  if (error || !model?.id || !model.name) {
    return {
      error: "Could not verify model capabilities. Refresh and try again.",
    };
  }

  const capabilities = parseVerifiedCapabilities(
    model.capabilities,
    modelId,
    model.name,
  );
  if (!capabilities) {
    return {
      error: `Could not verify interaction capabilities for "${model.name}". Refresh and try again.`,
    };
  }

  return {
    modelId,
    modelName: model.name,
    capabilities,
  };
}

/** Authoritative async gate for cold and version-pinned execution targets. */
export async function assertExecutionTargetLaunchable(
  getState: () => RootState,
  targetId: string,
  isVersion: boolean,
): Promise<{ ok: true } | { error: string }> {
  const snapshot = await resolveLaunchModelSnapshot(
    getState,
    targetId,
    isVersion,
  );
  if ("error" in snapshot) return snapshot;
  if (snapshot.capabilities.interaction === "extraction") {
    return {
      error: `"${snapshot.modelName}" is an extraction model (NER/classification) and can't run as a chat agent.`,
    };
  }
  return { ok: true };
}

/**
 * Resolves the runtime for `(agentId, surfaceName)`. Pure-async — does
 * its own DB calls for missing target/model data and the surface row. Target
 * or model verification failures return `{ error }`; only an unavailable
 * surface-mode lookup falls back to `python-stream`.
 */
export async function resolveAgentRuntime(
  getState: () => RootState,
  opts: ResolveAgentRuntimeOpts,
): Promise<PickRuntimeResult> {
  const snapshot = await resolveLaunchModelSnapshot(
    getState,
    opts.agentId,
    false,
  );
  if ("error" in snapshot) return snapshot;
  const { capabilities: caps, modelId, modelName } = snapshot;

  // Extraction models are refused BEFORE the no-surfaceName early return —
  // most launch paths (/chat, runner, cx-chat, shortcuts) have no surface
  // name, and the pickRuntime check below is unreachable for them.
  if (caps.interaction === "extraction") {
    return {
      error: `"${modelName ?? modelId}" is an extraction model (NER/classification) and can't run as a chat agent.`,
    };
  }

  // Without a surface name we can't pick a non-default runtime. Behave as today.
  if (!opts.surfaceName) {
    return { runtime: "python-stream" };
  }

  const surfaceMode = await fetchSurfaceExecutionMode(opts.surfaceName);

  return pickRuntime({
    modelInteraction: caps.interaction,
    surfaceMode,
    agentHint: opts.agentHint ?? null,
  });
}
