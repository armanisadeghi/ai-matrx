// features/agents/agent-sets/orchestrator/useCreateOrchestrator.ts
//
// Create an orchestrator from the template and drop the user into the builder —
// where they pick the agents it coordinates on the CANONICAL rail (search/filter/
// tabs/peek/drag-drop), not in a cramped modal. The template ships an empty
// <available_agents> placeholder; the agent descriptions are filled later by the
// builder's "Sync agent listings" action (which runs the generator on whatever
// members are attached). See features/agents/docs/AGENT_SETS.md.

"use client";

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast-service";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isScopesRpcErr } from "@/features/scopes/types";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { createAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import type { SetAccent } from "../constants";
import { orchestratorService } from "./orchestratorService";
import { ORCHESTRATOR_SUPERVISOR_PROMPT, ORCHESTRATOR_USER_TEMPLATE } from "./constants";

export function useCreateOrchestrator() {
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (args: { name: string; accent: SetAccent; tagline?: string }): Promise<string | null> => {
      setError(null);
      setCreating(true);
      try {
        // 1) Copy the template. The new agent ships the empty <available_agents>
        //    placeholder; org is backfilled by the DB `_stamp_org_default` trigger.
        const created = await orchestratorService.createFromTemplate();
        if (isScopesRpcErr(created)) {
          setError(created.error.message);
          return null;
        }
        const orchestratorId = created.data.agentId;

        // 2) Name it + make it a tool-calling SUPERVISOR (the template ships a
        //    planner prompt that never delegates; runtime delegation projects the
        //    members as tools, so the orchestrator must be told to call them).
        //    Non-fatal — the builder still opens — but LOUD: a failed supervisor
        //    write leaves the template's PLANNER prompt, which never delegates,
        //    and "Sync agent listings" won't recover it (it only refills
        //    <available_agents>). So we scream rather than silently ship a dud.
        await orchestratorService.rename(orchestratorId, args.name.trim() || "Agent Orchestrator");
        const promptRes = await orchestratorService.setOrchestratorMessages(
          orchestratorId,
          ORCHESTRATOR_SUPERVISOR_PROMPT,
          ORCHESTRATOR_USER_TEMPLATE,
        );
        if (!promptRes.ok) {
          toast.warning(
            "Orchestrator created, but its supervisor prompt failed to save — it may not delegate to members. Re-open it and re-save the prompt.",
          );
        }

        // 3) Create the (empty) set. If the marker write fails we STILL route to
        //    the created agent — the builder's "Make an orchestrator" CTA recovers.
        await dispatch(
          createAgentSet({
            orchestratorId,
            label: args.name.trim() || undefined,
            config: { accent: args.accent, tagline: args.tagline?.trim() || undefined },
          }),
        );

        // 4) Hydrate the new agent so the builder renders it immediately.
        try {
          await dispatch(fetchFullAgent(orchestratorId)).unwrap();
        } catch {
          /* best-effort */
        }

        return orchestratorId;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the orchestrator.");
        return null;
      } finally {
        setCreating(false);
      }
    },
    [dispatch],
  );

  return { create, creating, error };
}
