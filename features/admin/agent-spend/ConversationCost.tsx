"use client";

/**
 * The open conversation's cost on an agent run page. It lives where nothing can overlap:
 * a "Conversation cost $X" row in the agent's existing ⋮ menu (super admins), which opens a
 * dialog listing every billed model call and a door to the spend detail of the agent /
 * mandate the money was actually booked to. The page mounts <ConversationSpendDialog/>
 * (no footprint until opened); the menu mounts <ConversationCostMenuRow/>.
 * Reads ?conversationId= from the address, so it follows the runner as conversations switch.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { agentSpendDetailHref, fetchConversationSpend, type ConversationSpendCall } from "./agentSpend";

/** The (agent, mandate, source) the conversation's money was booked to — the one with the most spend. */
function dominantSubject(calls: ConversationSpendCall[], fallbackAgentId: string) {
  const by = new Map<string, { agent_id: string | null; mandate_key: string | null; unattributed_source: string | null; cost: number }>();
  for (const c of calls) {
    const k = `${c.agent_id ?? "-"}|${c.mandate_key ?? "-"}|${c.source ?? "-"}`;
    const cur = by.get(k) ?? { agent_id: c.agent_id, mandate_key: c.mandate_key, unattributed_source: c.source, cost: 0 };
    cur.cost += c.cost;
    by.set(k, cur);
  }
  const top = [...by.values()].sort((a, b) => b.cost - a.cost)[0];
  return top ?? { agent_id: fallbackAgentId, mandate_key: null, unattributed_source: null, cost: 0 };
}

// ── Open/close store: the ⋮ menu row opens the dialog the page mounts ──────────────────
let dialogOpen = false;
const listeners = new Set<() => void>();
const setDialogOpen = (v: boolean) => {
  dialogOpen = v;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Fetches one conversation's billed calls; refetches when `refreshKey` changes. */
function useConversationCalls(conversationId: string | null, refreshKey: unknown) {
  const [calls, setCalls] = useState<ConversationSpendCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    let live = true;
    setCalls(null);
    setError(null);
    fetchConversationSpend(conversationId)
      .then((c) => live && setCalls(c))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [conversationId, refreshKey]);
  return { calls, error };
}

/** The ⋮ menu row: the conversation's cost as text; selecting it opens the call list. */
export function ConversationCostMenuRow({ children }: { children: (props: { label: string; open: () => void }) => React.ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  useEffect(() => {
    setConversationId(new URLSearchParams(window.location.search).get("conversationId"));
  }, []);
  const { calls, error } = useConversationCalls(conversationId, "menu");
  const { format } = useCostDisplay();
  if (!conversationId) return null;
  const total = calls?.reduce((s, c) => s + c.cost, 0) ?? null;
  const label = error ? "Conversation cost unavailable" : total == null ? "Conversation cost…" : `Conversation cost ${format(total, { short: true })}`;
  return <>{children({ label, open: () => setDialogOpen(true) })}</>;
}

export function ConversationSpendDialog({ agentId }: { agentId: string }) {
  const conversationId = useSearchParams().get("conversationId");
  const open = useSyncExternalStore(subscribe, () => dialogOpen, () => false);
  const { calls, error } = useConversationCalls(conversationId, open);
  const { format, toPoints } = useCostDisplay();

  const columns = useMemo<MatrxColumnDef<ConversationSpendCall>[]>(
    () => [
      { id: "when", header: "When", accessorKey: "created_at", filter: "date", width: 90, cell: (c) => <span className="text-xs tabular-nums">{new Date(c.created_at).toLocaleTimeString()}</span> },
      { id: "model", header: "Model", accessorFn: (c) => c.model ?? "Not recorded", filter: "text", width: 190, cell: (c) => <span className="truncate text-xs" title={c.model ?? undefined}>{c.model ?? "Not recorded"}</span> },
      { id: "tokens_in", header: "In", accessorKey: "tokens_in", filter: "number", width: 80, cell: (c) => <span className="text-xs tabular-nums">{c.tokens_in.toLocaleString()}</span> },
      { id: "tokens_cached", header: "Cached", accessorKey: "tokens_cached", filter: "number", width: 80, cell: (c) => <span className="text-xs tabular-nums">{c.tokens_cached.toLocaleString()}</span> },
      { id: "tokens_out", header: "Out", accessorKey: "tokens_out", filter: "number", width: 80, cell: (c) => <span className="text-xs tabular-nums">{c.tokens_out.toLocaleString()}</span> },
      { id: "cost", header: "Cost", accessorKey: "cost", filter: "number", width: 100, cell: (c) => <Cost usd={c.cost} short className="text-xs tabular-nums" /> },
    ],
    [],
  );

  if (!conversationId) return null;
  const total = calls?.reduce((s, c) => s + c.cost, 0) ?? null;
  const turns = calls?.reduce((s, c) => s + Math.max(c.calls, c.iterations), 0) ?? 0;
  const subject = calls ? dominantSubject(calls, agentId) : null;

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-4">
            <span>Conversation cost</span>
            {total != null && (
              <>
                <span className="text-sm font-normal tabular-nums">{`$${total.toFixed(2)}`}</span>
                <span className="text-sm font-normal tabular-nums text-muted-foreground">{`${(toPoints(total) ?? 0).toLocaleString()} points`}</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="text-sm text-destructive">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        ) : calls == null ? (
          <div className="flex h-24 items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading cost
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{`${calls.length} calls · ${turns} turns`}</span>
              {subject && (
                <Link
                  href={agentSpendDetailHref(subject, 30, "admin")}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> {subject.mandate_key ? "Mandate spend" : "Agent spend"}
                </Link>
              )}
            </div>
            <MatrxDataTable
              data={calls}
              columns={columns}
              getRowId={(c) => c.execution_id}
              frameHeight="content"
              selection={false}
              detail={{ enabled: false }}
              toolbar={{ search: false }}
              defaultSort={{ id: "when", direction: "asc" }}
              emptyState={{ title: "No billed calls yet" }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
