"use client";

// features/start/widgets/bodies/AgentsWidget.tsx — the agents the person pinned (agent-kind favorites),
// each opening the agent and offering Chat (its direct chat route, /chat/a/<id>). A pinned agent that was
// deleted, or that the person can no longer open, says so by name (the access gate's own answer). With
// nothing pinned: the agents the person used most recently (the search projection, newest first) that the
// access gate says THIS person can open, each with a Pin star. A pinned agent that became unreachable keeps
// an Unpin. Rows that share a name carry what tells them apart (the projection's subtitle).
import Link from "next/link";
import { MessageCircle, StarOff } from "lucide-react";
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

/** Recent agents this person can open, with a tell-apart line for rows that share a name. */
export function openableRecentAgents<R extends { entity_id: string; title: string | null; subtitle: string | null }>(
  rows: readonly R[],
  status: (id: string) => string | undefined,
): (R & { label: string; tell: string | null })[] {
  const open = rows.filter((r) => status(r.entity_id) === "ok");
  const counts = new Map<string, number>();
  for (const r of open) counts.set(r.title || "", (counts.get(r.title || "") ?? 0) + 1);
  return open.map((r) => ({
    ...r,
    label: r.title || "Untitled agent",
    tell: (counts.get(r.title || "") ?? 0) > 1 ? r.subtitle || r.entity_id.slice(0, 8) : null,
  }));
}

export function AgentsWidget({ size }: StartWidgetBodyProps) {
  const { favorites, unpin } = usePinned();
  const pinned = favorites.filter((f) => f.kind === "agent");
  const limit = slotRows("agents", size) * 3; // read extra: rows this person cannot open are dropped
  const recent = useQuery({
    queryKey: ["start-recent-agents", limit],
    enabled: pinned.length === 0,
    staleTime: 60_000,
    queryFn: () => searchItemsAsPerson({ query: "", tokens: ["agent"], limit }),
  });
  const ids = pinned.length > 0 ? pinned.map((f) => agentIdOf(f.id)) : (recent.data ?? []).map((r) => r.entity_id);
  const access = useAccessStates("agent", ids);

  if (pinned.length === 0) {
    const rows: WidgetRow[] = openableRecentAgents(recent.data ?? [], (id) => access.states.get(id)?.status).map((r) => ({
      key: r.entity_id,
      title: r.label,
      href: `/agents/${encodeURIComponent(r.entity_id)}`,
      icon: AGENT_ICON,
      meta: r.tell,
      action: (
        <span className="flex shrink-0 items-center">
          {chatAction(r.entity_id, r.label)}
          <PinButton size="sm" item={{ id: favoriteId("agent", r.entity_id), kind: "agent", label: r.label, href: `/agents/${r.entity_id}` }} />
        </span>
      ),
    }));
    return (
      <WidgetList
        type="agents"
        size={size}
        loading={recent.isLoading || (ids.length > 0 && access.isLoading)}
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
          href: gone || denied ? null : `/agents/${encodeURIComponent(id)}`,
          icon: AGENT_ICON,
          tone: gone || denied ? "muted" : "default",
          // read-gate-exempt: gone and denied are the read's per-row answers, labelled here
          meta: gone ? "Removed" : denied ? "No access" : null,
          action:
            gone || denied ? (
              <Button variant="quiet" removes icon={<StarOff className="h-3.5 w-3.5" aria-hidden />} aria-label={`Unpin ${f.label}`} onClick={() => unpin(f.id)} />
            ) : (
              <span className="flex shrink-0 items-center">
                {chatAction(id, f.label)}
                <PinButton size="sm" item={{ id: f.id, kind: "agent", label: f.label, href: f.href }} />
              </span>
            ),
        };
      })}
    />
  );
}
