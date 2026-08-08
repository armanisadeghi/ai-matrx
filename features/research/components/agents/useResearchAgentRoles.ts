"use client";

import { useEffect, useState } from "react";
import { fetchSlotPins } from "@/features/agents/slots/service";
import {
  AGENT_ROLE_TEMPLATES,
  type AgentRoleDefinition,
} from "./constants";

/**
 * Resolve the research agent roles against the agent-slot registry (DB-truth
 * pins from `agent.slot_definition`). Roles whose slot is missing or has no
 * master id are dropped LOUDLY (console.error inside fetchSlotPins) rather
 * than rendered with a stale hardcoded id — a missing slot is a platform
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
        const pins = await fetchSlotPins(
          AGENT_ROLE_TEMPLATES.map((t) => t.slotKey),
        );
        if (cancelled) return;
        setRoles(
          AGENT_ROLE_TEMPLATES.flatMap((t) => {
            const pin = pins[t.slotKey];
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
