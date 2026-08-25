"use client";

/**
 * useKindAgentLaunch — the ONE seam that hands a Shape (kind) job to the agent
 * bound to the surface the user is standing on.
 *
 * Replaces the old `agentRunWindow` hand-off (a bare chat window that opened
 * with a brief and NO page context). Everything now goes through the canonical
 * launcher — the exact recipe `SurfaceRoleAgentButton` uses — so a run started
 * from the studio arrives with:
 *
 *   - the surface's own AGENT: a `ui_surface_agent_role` position (mandate-
 *     backed, user-overridable), never a UUID frozen in a component, and
 *     visible in the header Agents menu as an agent mapped to this surface;
 *   - the LIVE page scope: `runtime.surfaceName` + the scope the page's
 *     `<SurfaceRuntimeProvider>` builds at click time, so every declared
 *     surface value (the kind, its schema, its samples, the activation
 *     verdict) reaches the agent through its own bindings;
 *   - the composed BRIEF on the agent's declared variables (`task_brief`,
 *     `kind_schema`, `user_data_sample`) — never smuggled into the composer.
 *     THE USER-INPUT LAW: common-docs/systems/agents/agent-variable-binding.
 *
 * It opens a floating WINDOW on the current page (`flexible-panel`), with the
 * variable panel showing, and `autoRun` off — the user reads the brief, edits
 * anything, and sends. No navigation, ever.
 *
 * Loud on every failure path (unbound role, missing runtime, launch error) —
 * never a silent no-op.
 */

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { getSurfaceRuntimeForName } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

export interface KindAgentLaunchInput {
  /** Declared-variable values (task_brief / kind_schema / user_data_sample). */
  variables: Record<string, string>;
  /**
   * Composer pre-fill — ONLY a short human kick phrase, never structured
   * content. Omit to leave the composer empty for the user to type.
   */
  draftText?: string;
}

export interface UseKindAgentLaunchResult {
  /** True once a role agent is resolved and the launch can actually happen. */
  ready: boolean;
  launching: boolean;
  /** The role's canonical label, for chrome that wants to name the agent. */
  roleLabel: string | null;
  launch: (input: KindAgentLaunchInput) => Promise<void>;
}

export function useKindAgentLaunch(
  surfaceName: string,
  roleName: string,
): UseKindAgentLaunchResult {
  const { roles } = useSurfaceAgentRoles(surfaceName);
  const { launchAgent } = useAgentLauncher();
  const [launching, setLaunching] = useState(false);

  const role = roles[roleName];
  const agentId = role?.effectiveAgentId ?? null;

  const launch = useCallback(
    async ({ variables, draftText }: KindAgentLaunchInput) => {
      if (!agentId) {
        // The role exists in the manifest but nothing fills it — say so with
        // the exact name to fix, never a shrug.
        toast.error("No agent is set for this job yet", {
          description: `The "${roleName}" role on ${surfaceName} has no agent. Pick one in the header Agents menu, or check its mandate in the admin console.`,
        });
        return;
      }
      setLaunching(true);
      try {
        // Read the live provider at CLICK time, scoped to THIS surface — an
        // unrelated overlay open on top must never win the page's own scope.
        const runtime = getSurfaceRuntimeForName(surfaceName);
        let applicationScope: ApplicationScope = {};
        if (runtime) {
          applicationScope = (await runtime.getScope()) as ApplicationScope;
        } else {
          // A run without page context still works — but the user must know
          // the agent is flying blind, because that is the whole point here.
          toast.message("Running without live page context", {
            description:
              "This page has not registered its live values — the agent still runs, with less context.",
          });
        }
        await launchAgent(agentId, {
          surfaceKey: `surface-role:${surfaceName}:${roleName}`,
          sourceFeature:
            sourceFeatureFromSurfaceName(surfaceName) ?? "ai-results",
          config: {
            displayMode: "flexible-panel",
            allowChat: true,
            showVariablePanel: true,
            autoRun: false,
          },
          runtime: {
            surfaceName,
            applicationScope,
            variables,
            ...(draftText ? { userInput: draftText } : {}),
          },
        });
      } catch (error) {
        console.error(
          `[useKindAgentLaunch] launch failed for ${surfaceName}:${roleName}:`,
          error,
        );
        toast.error(
          error instanceof Error ? error.message : "Could not start the agent",
        );
      } finally {
        setLaunching(false);
      }
    },
    [agentId, launchAgent, roleName, surfaceName],
  );

  return {
    ready: Boolean(agentId),
    launching,
    roleLabel: role?.role.label ?? null,
    launch,
  };
}
