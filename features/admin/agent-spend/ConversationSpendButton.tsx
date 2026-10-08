"use client";

/**
 * The open conversation's cost on an agent run page: a compact header button showing
 * its total; it opens every billed model call (model, tokens, turns, cost) and a door
 * to the agent's spend detail. Reads ?conversationId= from the address, so it follows
 * the runner as conversations switch. Renders nothing until a conversation is open.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { agentSpendDetailHref, fetchConversationSpend, type ConversationSpendCall } from "./agentSpend";

export function ConversationSpendButton({ agentId }: { agentId: string }) {
  const conversationId = useSearchParams().get("conversationId");
  const [calls, setCalls] = useState<ConversationSpendCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { format } = useCostDisplay();

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
    // Refetch when the popover opens so a run that just finished is counted.
  }, [conversationId, open]);

  if (!conversationId) return null;
  const total = calls?.reduce((s, c) => s + c.cost, 0) ?? null;
  const turns = calls?.reduce((s, c) => s + Math.max(c.calls, c.iterations), 0) ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          icon={calls == null && !error ? <Loader2 className="animate-spin" /> : <Coins />}
          aria-label="Conversation cost"
          title={total == null ? "Conversation cost" : `Conversation cost: ${format(total)}`}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[34rem] max-w-[95vw] p-3">
        {error ? (
          <div className="text-sm text-destructive">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        ) : calls == null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading cost
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">
                <Cost usd={total} /> · {`${calls.length} calls · ${turns} turns`}
              </span>
              <Link
                href={agentSpendDetailHref({ agent_id: agentId, mandate_key: null }, 30, "admin")}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Agent spend
              </Link>
            </div>
            {calls.length === 0 ? (
              <div className="text-xs text-muted-foreground">No billed calls yet.</div>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 font-normal">#</th>
                      <th className="py-1 pr-2 font-normal">Model</th>
                      <th className="py-1 pr-2 text-right font-normal">In</th>
                      <th className="py-1 pr-2 text-right font-normal">Cached</th>
                      <th className="py-1 pr-2 text-right font-normal">Out</th>
                      <th className="py-1 text-right font-normal">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((c, i) => (
                      <tr key={c.execution_id} className="border-t border-border">
                        <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                        <td className="max-w-[12rem] truncate py-1 pr-2" title={c.model ?? undefined}>{c.model ?? "Not recorded"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.tokens_in.toLocaleString()}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.tokens_cached.toLocaleString()}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.tokens_out.toLocaleString()}</td>
                        <td className="py-1 text-right"><Cost usd={c.cost} short className="tabular-nums" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
