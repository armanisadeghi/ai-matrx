// features/agents/agent-sets/components/GenerateOrchestratorDialog.tsx
//
// "Generate an orchestrator" — for users who don't already have one. Pick the
// specialist agents it should coordinate, name it, and we: copy the orchestrator
// template, run the Agent Description Generator on the selected agents, inject the
// result into the new agent's <available_agents> section, and wire it up as an
// Agent Set (orchestrator + members). Then it opens in the builder, runnable.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Network, Search, Workflow } from "lucide-react";
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
import { AgentPeekButton } from "./AgentPeekButton";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT, SET_ACCENTS, type SetAccent } from "../constants";
import {
  useOrchestratorGenerator,
  type GenStep,
} from "../orchestrator/useOrchestratorGenerator";

const STEPS: { key: GenStep; label: string }[] = [
  { key: "generating", label: "Generating agent descriptions" },
  { key: "creating", label: "Creating the orchestrator" },
  { key: "wiring", label: "Wiring its prompt" },
  { key: "building", label: "Building the set" },
];
const STEP_ORDER: GenStep[] = ["generating", "creating", "wiring", "building", "done"];

export interface GenerateOrchestratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select these agents as members. */
  seedMemberIds?: string[];
}

export function GenerateOrchestratorDialog({
  open,
  onOpenChange,
  seedMemberIds,
}: GenerateOrchestratorDialogProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const agents = useAppSelector(selectPickableAgents);
  const { step, error, generate, reset } = useOrchestratorGenerator();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(seedMemberIds ?? []));
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<SetAccent>(DEFAULT_SET_ACCENT);

  useEffect(() => {
    if (open) dispatch(fetchAgentsList());
  }, [open, dispatch]);

  const busy = step !== "idle" && step !== "done" && step !== "error";

  const handleOpenChange = (next: boolean) => {
    if (busy) return; // don't close mid-run
    if (!next) {
      setSearch("");
      setSelected(new Set(seedMemberIds ?? []));
      setName("");
      setTagline("");
      setAccent(DEFAULT_SET_ACCENT);
      reset();
    }
    onOpenChange(next);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter(
      (a) =>
        !q ||
        a.name?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q) ||
        a.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [agents, search]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const runningRef = useRef(false);

  const handleGenerate = async () => {
    if (runningRef.current) return; // guard a fast double-click before `busy` re-renders
    const memberIds = Array.from(selected);
    if (memberIds.length === 0) return;
    runningRef.current = true;
    try {
      const { orchestratorId, warning: genWarning } = await generate({
        memberIds,
        name,
        accent,
        tagline,
      });
      if (orchestratorId) {
        if (genWarning)
          toast.error(`Orchestrator created — use “Sync prompt” to add descriptions: ${genWarning}`);
        else toast.success("Orchestrator created.");
        handleOpenChange(false);
        router.push(`/agents/sets/${orchestratorId}`);
      }
    } finally {
      runningRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            Generate an orchestrator
          </DialogTitle>
          <DialogDescription>
            Pick the specialist agents it should coordinate. We&apos;ll create an
            orchestrator agent that knows each one and wire them into a set.
          </DialogDescription>
        </DialogHeader>

        {busy || step === "done" ? (
          <div className="space-y-3 py-2">
            {STEPS.map((s, i) => {
              const idx = STEP_ORDER.indexOf(s.key);
              const state =
                step === "done" || idx < currentStepIndex
                  ? "done"
                  : idx === currentStepIndex
                    ? "active"
                    : "pending";
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      state === "done" && "bg-primary text-primary-foreground",
                      state === "active" && "bg-primary/15 text-primary",
                      state === "pending" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : state === "active" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm",
                      state === "pending" ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {/* identity */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Orchestrator name <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Defaults to “Agent Orchestrator”"
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

            {/* member multi-select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Agents to coordinate
                </label>
                <span className="text-[11px] text-muted-foreground">{selected.size} selected</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your agents…"
                  className="pl-8"
                />
              </div>
              <ScrollArea className="h-52 rounded-md border border-border">
                <div className="divide-y divide-border">
                  {filtered.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No agents found.
                    </div>
                  )}
                  {filtered.map((a) => {
                    const isSel = selected.has(a.id);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/60",
                          isSel && "bg-primary/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              isSel ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                          >
                            {isSel && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {a.name || "Untitled Agent"}
                            </span>
                            {a.category && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {a.category}
                              </span>
                            )}
                          </span>
                        </button>
                        <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                          <AgentPeekButton agentId={a.id} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === "error" ? (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => reset()}>Try again</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selected.size === 0 || busy}
                className="gap-1.5"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Network className="h-4 w-4" />
                )}
                Generate orchestrator
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
