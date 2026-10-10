"use client";

// features/start/widgets/bodies/AgentsWidget.tsx — the agents the person pinned (agent-kind favorites),
// each opening the agent and offering Chat (its direct chat route, /chat/a/<id>). A pinned agent that was
// deleted, or that the person can no longer open, says so by name (the access gate's own answer). With
// nothing pinned: the agents the person used most recently (the search projection, newest first), each
// with a Pin star — so the widget is never an empty box.
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ai-matrx/design-system/controls";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { favoriteId, usePinned } from "@/components/favorites/usePinned";
import { PinButton } from "@/components/favorites/PinButton";
import { useAccessStates } from "@/features/access-gate/hooks/useAccessStates";
import { searchItemsAsPerson } from "@/features/board/tools/search-items";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList, slotRows, type WidgetRow } from "../frame";

const agentIdOf = (id: string) => (id.startsWith("agent:") ? id.slice(6) : id);

function chatAction(id: string, label: string) {
  return (
    <Button variant="quiet" asChild icon={<MessageCircle className="h-3.5 w-3.5" aria-hidden />} aria-label={`Chat with ${label}`}>
      <Link href={`/chat/a/${encodeURIComponent(id)}`} />
    </Button>
  );
}

export function AgentsWidget({ size }: StartWidgetBodyProps) {
  const { favorites } = usePinned();
  const pinned = favorites.filter((f) => f.kind === "agent");
  const ids = pinned.map((f) => agentIdOf(f.id));
  const access = useAccessStates("agent", ids);
  const limit = slotRows("agents", size);
  const recent = useQuery({
    queryKey: ["start-recent-agents", limit],
    enabled: pinned.length === 0,
    staleTime: 60_000,
    queryFn: () => searchItemsAsPerson({ query: "", tokens: ["agent"], limit }),
  });

  if (pinned.length === 0) {
    const rows: WidgetRow[] = (recent.data ?? []).map((r) => {
      const label = r.title || "Untitled agent";
      return {
        key: r.entity_id,
        title: label,
        href: `/agents/${encodeURIComponent(r.entity_id)}`,
        icon: AGENT_ICON,
        action: (
          <span className="flex shrink-0 items-center">
            {chatAction(r.entity_id, label)}
            <PinButton size="sm" item={{ id: favoriteId("agent", r.entity_id), kind: "agent", label, href: `/agents/${r.entity_id}` }} />
          </span>
        ),
      };
    });
    return (
      <WidgetList
        type="agents"
        size={size}
        loading={recent.isLoading}
        error={recent.error ? recent.error.message : null}
        empty="No agents yet"
        rows={rows}
      />
    );
  }

  return (
    <WidgetList
      type="agents"
      size={size}
      loading={false}
      empty="No pinned agents"
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
          action: gone || denied ? null : chatAction(id, f.label),
        };
      })}
    />
  );
}
