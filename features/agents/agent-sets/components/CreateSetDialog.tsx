// features/agents/agent-sets/components/CreateSetDialog.tsx
//
// Create a set from an EXISTING agent as its orchestrator. The picker reuses the
// CANONICAL agent filter (the same `useAgentConsumer` + filtered selectors +
// <DesktopFilterPanel> as /agents/all and the builder rail) — Mine/Shared/All tabs,
// category/tag filters, sort, search, and per-row peek — never an alphabetical dump.
// Agents load once via useEnsureAgentsLoaded (no refetch).

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Network, Search } from "lucide-react";
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
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import {
  makeSelectFilteredOwnedAgents,
  makeSelectFilteredSharedAgents,
  selectAllAgentCategories,
  selectAllAgentTags,
  selectTotalSharedAgentsCount,
} from "@/features/agents/redux/agent-consumers/selectors";
import { DesktopFilterPanel } from "@/features/agents/components/shared/DesktopFilterPanel";
import { createAgentSet, addAgentToSet } from "@/features/agents/redux/agent-sets/thunks";
import { useEnsureAgentsLoaded } from "../hooks/useEnsureAgentsLoaded";
import { AgentPeekButton } from "./AgentPeekButton";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT, SET_ACCENTS, type SetAccent } from "../constants";

const PICKER_CONSUMER = "agent-sets-orchestrator-picker";

/** Bridge DesktopFilterPanel's whole-array setter onto the consumer's per-item toggle. */
function applyArrayViaToggle(current: string[], next: string[], toggle: (v: string) => void) {
  const cur = new Set(current);
  const nxt = new Set(next);
  current.forEach((v) => !nxt.has(v) && toggle(v));
  next.forEach((v) => !cur.has(v) && toggle(v));
}

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
  useEnsureAgentsLoaded();

  const consumer = useAgentConsumer(PICKER_CONSUMER, { initialTab: "mine" });
  const selOwned = useMemo(() => makeSelectFilteredOwnedAgents(PICKER_CONSUMER), []);
  const selShared = useMemo(() => makeSelectFilteredSharedAgents(PICKER_CONSUMER), []);
  const owned = useAppSelector(selOwned);
  const shared = useAppSelector(selShared);
  const allCategories = useAppSelector(selectAllAgentCategories);
  const allTags = useAppSelector(selectAllAgentTags);
  const totalShared = useAppSelector(selectTotalSharedAgentsCount);

  const [orchestratorId, setOrchestratorId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<SetAccent>(DEFAULT_SET_ACCENT);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const base =
      consumer.tab === "shared" ? shared : consumer.tab === "mine" ? owned : [...owned, ...shared];
    return base.filter((a) => a.id !== seedMemberId);
  }, [consumer.tab, owned, shared, seedMemberId]);

  const selected = orchestratorId
    ? [...owned, ...shared].find((a) => a.id === orchestratorId)
    : null;

  const activeFilterCount =
    consumer.includedCats.length +
    consumer.includedTags.length +
    (consumer.favFilter !== "all" ? 1 : 0) +
    (consumer.archFilter !== "active" ? 1 : 0);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setOrchestratorId(null);
      setLabel("");
      setTagline("");
      setAccent(DEFAULT_SET_ACCENT);
    }
    onOpenChange(next);
  };

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
    if (seedMemberId) await dispatch(addAgentToSet({ orchestratorId, agentId: seedMemberId }));
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
            Pick the agent that presides over this set as its orchestrator, then add
            members on the builder canvas.
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
          {/* orchestrator picker — canonical filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Orchestrator agent</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={consumer.searchTerm}
                  onChange={(e) => consumer.setSearchTerm(e.target.value)}
                  placeholder="Search your agents…"
                  className="pl-8"
                />
              </div>
              <DesktopFilterPanel
                iconOnly
                sortBy={consumer.sortBy}
                setSortBy={consumer.setSortBy}
                activeTab={consumer.tab}
                setActiveTab={consumer.setTab}
                includedCats={consumer.includedCats}
                setIncludedCats={(next) =>
                  applyArrayViaToggle(consumer.includedCats, next, consumer.toggleCategory)
                }
                includedTags={consumer.includedTags}
                setIncludedTags={(next) =>
                  applyArrayViaToggle(consumer.includedTags, next, consumer.toggleTag)
                }
                favFilter={consumer.favFilter}
                setFavFilter={consumer.setFavFilter}
                archFilter={consumer.archFilter}
                setArchFilter={consumer.setArchFilter}
                favoritesFirst={consumer.favoritesFirst}
                setFavoritesFirst={(v) => {
                  if (v !== consumer.favoritesFirst) consumer.toggleFavoritesFirst();
                }}
                allCategories={allCategories}
                allTags={allTags}
                resetFilters={consumer.resetFilters}
                activeFilterCount={activeFilterCount}
                hasShared={totalShared > 0}
              />
            </div>
            <ScrollArea className="h-44 rounded-md border border-border">
              <div className="divide-y divide-border">
                {candidates.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No agents match. Adjust filters or search.
                  </div>
                )}
                {candidates.map((a) => {
                  const isSel = a.id === orchestratorId;
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/60",
                        isSel && "bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setOrchestratorId(a.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
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
                      <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                        <AgentPeekButton agentId={a.id} />
                      </span>
                    </div>
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
