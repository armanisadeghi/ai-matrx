"use client";

// features/start/widgets/bodies/AgentsWidget.tsx — the agents the person pinned (agent-kind favorites),
// each with Open (the agent's page) and Run (its run route). A pinned agent that was deleted, or that
// the person can no longer open, says so by name (the access gate's own answer, `useAccessStates`).
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { usePinned } from "@/components/favorites/usePinned";
import { useAccessStates } from "@/features/access-gate/hooks/useAccessStates";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList } from "../frame";

const agentIdOf = (favoriteId: string) => (favoriteId.startsWith("agent:") ? favoriteId.slice(6) : favoriteId);

export function AgentsWidget({ size }: StartWidgetBodyProps) {
  const { favorites } = usePinned();
  const pinned = favorites.filter((f) => f.kind === "agent");
  const ids = pinned.map((f) => agentIdOf(f.id));
  const access = useAccessStates("agent", ids);
  return (
    <WidgetList
      type="agents"
      size={size}
      loading={false}
      empty="Star an agent to pin it here"
      rows={pinned.map((f) => {
        const id = agentIdOf(f.id);
        const status = access.states.get(id)?.status;
        const gone = status === "deleted" || status === "missing";
        const denied = status === "denied";
        return {
          key: f.id,
          title: f.label,
          href: gone ? null : `/agents/${encodeURIComponent(id)}`,
          icon: AGENT_ICON,
          tone: gone || denied ? "muted" : "default",
          meta: gone ? "Removed" : denied ? "No access" : null,
          action:
            gone || denied ? null : (
              <Button variant="quiet" asChild icon={<Play className="h-3.5 w-3.5" aria-hidden />} aria-label={`Run ${f.label}`}>
                <Link href={`/agents/${encodeURIComponent(id)}/run`} />
              </Button>
            ),
        };
      })}
    />
  );
}
