"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listOwnerSuggestionsAction, resolveSuggestionAction } from "../actions";
import type { DeckSuggestionRow } from "../types";

/** The deck owner's inbox of suggest-edits on their decks. Accept/decline
 *  routes through the owner-gated RPC. */
export function OwnerSuggestionInbox() {
  const [rows, setRows] = useState<DeckSuggestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setRows(await listOwnerSuggestionsAction());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = (id: string, status: "accepted" | "declined") => {
    setPendingId(id);
    startTransition(async () => {
      try {
        await resolveSuggestionAction(id, status);
        await load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  };

  if (error) {
    return <p className="text-sm text-destructive">Failed to load: {error}</p>;
  }
  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading suggestions…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
        <Inbox className="mx-auto h-8 w-8 mb-3 opacity-60" />
        No suggestions on your decks yet.
      </div>
    );
  }

  const tone: Record<string, string> = {
    open: "",
    accepted: "text-emerald-600",
    declined: "text-muted-foreground",
  };

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {rows.map((s) => {
        const busy = pendingId === s.id && isPending;
        return (
          <div key={s.id} className="p-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm whitespace-pre-wrap">{s.body}</p>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant={s.status === "open" ? "secondary" : "outline"}
                  className={cn("text-[10px] uppercase", tone[s.status])}
                >
                  {s.status}
                </Badge>
                <span>{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            {s.status === "open" ? (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Accept"
                  disabled={busy}
                  onClick={() => resolve(s.id, "accepted")}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-emerald-600" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Decline"
                  disabled={busy}
                  onClick={() => resolve(s.id, "declined")}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
