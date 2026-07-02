// features/agents/agent-sets/components/CreateSetDialog.tsx
//
// Create a new Agent Set: choose which agent presides as the orchestrator, give
// the set an identity (name + accent + tagline), then jump into the builder.
// Optionally seeds a first member (from an agent card's "New set" action).

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Network, Search, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import { selectPickableAgents } from "@/features/agents/redux/agent-sets/selectors";
import { createAgentSet, addAgentToSet } from "@/features/agents/redux/agent-sets/thunks";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT, SET_ACCENTS, type SetAccent } from "../constants";

export interface CreateSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, this agent is added as the set's first member after creation. */
  seedMemberId?: string;
  /** Switch to the "generate a new orchestrator" flow (for users without one). */
  onGenerateInstead?: () => void;
}

export function CreateSetDialog({
  open,
  onOpenChange,
  seedMemberId,
  onGenerateInstead,
}: CreateSetDialogProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const agents = useAppSelector(selectPickableAgents);

  const [search, setSearch] = useState("");
  const [orchestratorId, setOrchestratorId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<SetAccent>(DEFAULT_SET_ACCENT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) dispatch(fetchAgentsList());
  }, [open, dispatch]);

  // Reset on close — done in the event handler (not an effect) to avoid a
  // setState-in-effect cascade.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setOrchestratorId(null);
      setLabel("");
      setTagline("");
      setAccent(DEFAULT_SET_ACCENT);
      setBusy(false);
    }
    onOpenChange(next);
  };

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .filter((a) => a.id !== seedMemberId)
      .filter(
        (a) =>
          !q ||
          a.name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [agents, search, seedMemberId]);

  const selected = orchestratorId ? agents.find((a) => a.id === orchestratorId) : null;

  const handleCreate = async () => {
    if (!orchestratorId) return;
    setBusy(true);
    const res = await dispatch(
      createAgentSet({
        orchestratorId,
        label: label.trim() || undefined,
        config: { accent, tagline: tagline.trim() || undefined },
      }),
    );
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error ?? "Could not create the set.");
      return;
    }
    if (seedMemberId) {
      await dispatch(addAgentToSet({ orchestratorId, agentId: seedMemberId }));
    }
    toast.success("Set created.");
    handleOpenChange(false);
    router.push(`/agents/sets/${orchestratorId}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            New agent set
          </DialogTitle>
          <DialogDescription>
            Pick the agent that presides over this set as its orchestrator, then
            drag in the members it coordinates.
            {onGenerateInstead && (
              <>
                {" "}
                Don&apos;t have one?{" "}
                <button
                  type="button"
                  onClick={onGenerateInstead}
                  className="font-medium text-primary hover:underline"
                >
                  Generate an orchestrator
                </button>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* orchestrator picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Orchestrator agent
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your agents…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-44 rounded-md border border-border">
              <div className="divide-y divide-border">
                {candidates.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No agents found.
                  </div>
                )}
                {candidates.map((a) => {
                  const isSel = a.id === orchestratorId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setOrchestratorId(a.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                        isSel && "bg-primary/5",
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <Webhook className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {a.name || "Untitled Agent"}
                        </div>
                        {a.category && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {a.category}
                          </div>
                        )}
                      </div>
                      {isSel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* identity */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Set name <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={selected?.name ? `Defaults to "${selected.name}"` : "Name this set…"}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Tagline <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="What does this set accomplish together?"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Accent</label>
              <div className="flex flex-wrap gap-1.5">
                {SET_ACCENTS.map((acc) => {
                  const ac = accentClasses(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      aria-label={acc}
                      onClick={() => setAccent(acc)}
                      className={cn(
                        "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                        ac.dot,
                        accent === acc ? "ring-foreground/40" : "ring-transparent",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!orchestratorId || busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
