// features/agents/agent-sets/orchestrator/useOrchestratorGenerator.ts
//
// Orchestrates the whole "generate an orchestrator" flow with progress steps:
//   generating → creating → wiring → building → done.
// Never loses the user's action: if description generation fails, the orchestrator
// + set are still created (with an empty <available_agents>) and a warning is
// surfaced so they can retry via the builder's "Sync prompt".

"use client";

import { useCallback, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isScopesRpcErr } from "@/features/scopes/types";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { addAgentToSet, createAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import type { SetAccent } from "../constants";
import { orchestratorService } from "./orchestratorService";
import { runAgentDescriptionGenerator } from "./thunks";

export type GenStep = "idle" | "generating" | "creating" | "wiring" | "building" | "done" | "error";

export interface GenerateArgs {
  memberIds: string[];
  name: string;
  accent: SetAccent;
  tagline?: string;
}

export function useOrchestratorGenerator() {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<GenStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const generate = useCallback(
    async (
      args: GenerateArgs,
    ): Promise<{ orchestratorId: string | null; warning: string | null }> => {
      setError(null);
      setWarning(null);
      const warnings: string[] = [];
      try {
        // 1) Generate the agent descriptions (the slow LLM step) — first, so a
        //    failure here doesn't strand a half-built agent.
        setStep("generating");
        const gen = await dispatch(runAgentDescriptionGenerator({ memberIds: args.memberIds }));

        // 2) Create the orchestrator agent from the template (org-less; owner = caller).
        setStep("creating");
        const created = await orchestratorService.createFromTemplate();
        if (isScopesRpcErr(created)) {
          setStep("error");
          setError(created.error.message);
          return { orchestratorId: null, warning: null };
        }
        const orchestratorId = created.data.agentId;

        // 3) Name it + inject the generated blocks. Org is NOT set here on purpose:
        //    the template copy is created org-less, but the DB `_stamp_org_default`
        //    BEFORE-INSERT trigger backfills the caller's PERSONAL org (accessible),
        //    so associations pass the org gate. We must NOT override it with a
        //    member's org — members can be SHARED agents in a foreign org the caller
        //    can't access, which would break the set with no recovery.
        setStep("wiring");
        const renamed = await orchestratorService.rename(
          orchestratorId,
          args.name.trim() || "Agent Orchestrator",
        );
        if (isScopesRpcErr(renamed)) warnings.push("Couldn't set the orchestrator name.");
        if (gen.ok && gen.xml) {
          const inj = await orchestratorService.injectAvailableAgents(orchestratorId, gen.xml);
          if (isScopesRpcErr(inj)) warnings.push(inj.error.message);
        } else {
          warnings.push(gen.error ?? "Agent descriptions weren't generated.");
        }

        // 4) Build the set: orchestrator + the selected members.
        setStep("building");
        const setRes = await dispatch(
          createAgentSet({
            orchestratorId,
            label: args.name.trim() || undefined,
            config: { accent: args.accent, tagline: args.tagline?.trim() || undefined },
          }),
        );
        if (!setRes.ok) {
          // The agent EXISTS — send the user to it so they can finish the set from
          // the builder's "Make this an orchestrator?" CTA (no re-mint on retry).
          const w = `Created the orchestrator, but couldn't build the set: ${
            setRes.error ?? "unknown error"
          }`;
          setWarning(w);
          setStep("done");
          return { orchestratorId, warning: w };
        }
        const memberResults = await Promise.all(
          args.memberIds.map((agentId) => dispatch(addAgentToSet({ orchestratorId, agentId }))),
        );
        const failed = memberResults.filter((r) => !r.ok).length;
        if (failed > 0) warnings.push(`${failed} member${failed === 1 ? "" : "s"} couldn't be added.`);

        // 5) Refresh the new agent into Redux so the builder renders it immediately.
        try {
          await dispatch(fetchFullAgent(orchestratorId)).unwrap();
        } catch {
          /* best-effort */
        }

        const warning = warnings[0] ?? null;
        setWarning(warning);
        setStep("done");
        // Return the FRESH warning — the `warning` state isn't visible to the
        // caller's closure until its next render.
        return { orchestratorId, warning };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong generating the orchestrator.";
        setStep("error");
        setError(msg);
        return { orchestratorId: null, warning: null };
      }
    },
    [dispatch],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setWarning(null);
  }, []);

  return { step, error, warning, generate, reset };
}
