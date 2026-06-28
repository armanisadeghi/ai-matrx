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
//   1. Read the agent's model_id from agentDefinition.
//   2. Read the model's `capabilities.interaction` from the model
//      registry. If the model isn't cached yet, fetch it.
//   3. Read the surface's `execution_mode` from ui_surface. We cache
//      a tiny per-surface result so launches stay fast.
//   4. Call `pickRuntime` and return.

import type { RootState } from "@/lib/redux/store";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  parseCapabilities,
  type ModelCapabilities,
} from "@/features/ai-models/capabilities/parse";
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
    .schema("ui").from("ui_surface")
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

/**
 * Resolves the runtime for `(agentId, surfaceName)`. Pure-async — does
 * its own DB call for the surface row if needed. Never throws — failures
 * collapse into a `{ runtime: "python-stream" }` fallback so an unrelated
 * DB hiccup can't block a launch.
 */
export async function resolveAgentRuntime(
  getState: () => RootState,
  opts: ResolveAgentRuntimeOpts,
): Promise<PickRuntimeResult> {
  const state = getState();
  const agent = state.agentDefinition.agents?.[opts.agentId];
  const modelId = agent?.modelId;
  if (!modelId) {
    return { runtime: "python-stream" };
  }

  const model = selectModelById(state, modelId);
  let caps: ModelCapabilities;
  if (model) {
    caps = parseCapabilities(model.capabilities, {
      api_class: model.api_class,
      provider: model.provider,
    });
  } else {
    // Model not in the registry cache — assume turn-based. The launcher
    // already fetches the model later; we're being defensive here.
    caps = { input: ["text"], output: ["text"], features: [], interaction: "turn" };
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
