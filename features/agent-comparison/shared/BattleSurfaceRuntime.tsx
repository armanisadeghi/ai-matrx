"use client";

/**
 * BattleSurfaceRuntime — makes every non-Model battle page the
 * `matrx-user/agent-battle` surface.
 *
 * The scope is read at trigger time from `buildBattleSnapshot`, the same read
 * the header's battle-wide Alchemy menu copies, so "Prepare this page", the
 * header agents and the right-click menu all see exactly the battle on
 * screen — blind masking included. Read-only: no write handlers.
 * Model mode mounts its own `ModelBattleSurfaceRuntime` instead.
 */

import type { ReactNode } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createAgentBattleScope } from "@/features/surfaces/manifests/agent-battle.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { RootState } from "@/lib/redux/store";
import { battleMarkdown, buildBattleSnapshot } from "./battleSnapshot";
import { RESPONSE_FEEDBACK_METRICS } from "./feedbackMetrics";

export const AGENT_BATTLE_SURFACE_NAME = "matrx-user/agent-battle";

export function buildAgentBattleScope(state: RootState): SurfaceScopePayload {
  const snap = buildBattleSnapshot(state);
  const rubric = RESPONSE_FEEDBACK_METRICS.map((m) => ({
    id: m.id,
    label: m.label,
    hint: m.hint,
  }));
  const blind = state.agentComparison.blind;
  if (!snap) {
    // Between pages (no mounted mode) — the always-present values stay honest.
    return createAgentBattleScope({
      battle_mode: { mode: null, label: "Agent battle", varies: null },
      blind_state: { active: blind.active, revealed: blind.revealed },
      feedback_rubric: rubric,
    });
  }
  return createAgentBattleScope({
    content: battleMarkdown(snap),
    context: { surface: "agent_battle", mode: snap.mode },
    battle_mode: { mode: snap.mode, label: snap.mode_label, varies: snap.varies },
    ...(snap.battle ? { battle: snap.battle } : {}),
    blind_state: snap.blind,
    ...(snap.agent ? { battle_agent: snap.agent } : {}),
    ...(snap.shared_request ? { shared_request: snap.shared_request } : {}),
    ...(snap.forked_from ? { forked_from: snap.forked_from } : {}),
    ...(snap.columns.length > 0 ? { battle_columns: snap.columns } : {}),
    feedback_rubric: snap.rubric,
  });
}

export function BattleSurfaceRuntime({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const getScope = () => buildAgentBattleScope(store.getState());

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_BATTLE_SURFACE_NAME}
      getScope={getScope}
    >
      <NonEditableContextMenu
        sourceFeature="agent-comparison"
        surfaceName={AGENT_BATTLE_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getScope}
        contentSource={{ type: "raw" }}
      >
        <div className="h-full min-h-0">{children}</div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
