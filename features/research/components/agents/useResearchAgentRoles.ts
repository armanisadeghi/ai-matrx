"use client";

import { useEffect, useState } from "react";
import { fetchMandatePins } from "@/features/agents/mandates/service";
import {
  AGENT_ROLE_TEMPLATES,
  type AgentRoleDefinition,
} from "./constants";

/**
 * Resolve the research agent roles against the agent-mandate registry (DB-truth
 * pins from `agent.slot_definition`). Roles whose mandate is missing or has no
 * master id are dropped LOUDLY (console.error inside fetchMandatePins) rather
 * than rendered with a stale hardcoded id — a missing mandate is a platform
 * defect, not something to paper over client-side.
 */
export function useResearchAgentRoles(): {
  roles: AgentRoleDefinition[];
  loading: boolean;
  error: string | null;
} {
  const [roles, setRoles] = useState<AgentRoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pins = await fetchMandatePins(
          AGENT_ROLE_TEMPLATES.map((t) => t.mandateKey),
        );
        if (cancelled) return;
        setRoles(
          AGENT_ROLE_TEMPLATES.flatMap((t) => {
            const pin = pins[t.mandateKey];
            if (!pin) return [];
            return [
              {
                ...t,
                systemAgentId: pin.agentId,
                systemVersionId: pin.versionId,
              },
            ];
          }),
        );
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { roles, loading, error };
}
