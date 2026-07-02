// features/agents/agent-sets/components/AgentSetsBrowser.tsx
//
// The /agents/sets list view — every orchestrated set the user can see. This is
// the "list, not a trapped detail" entry page: browse → open a set → build it.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Network, Plus, Search, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentSetsList } from "../hooks/useAgentSetsList";
import { AgentSetCard } from "./AgentSetCard";
import { CreateSetDialog } from "./CreateSetDialog";
import { GenerateOrchestratorDialog } from "./GenerateOrchestratorDialog";

export function AgentSetsBrowser() {
  const router = useRouter();
  const { sets, status } = useAgentSetsList();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.label?.toLowerCase().includes(q) ||
        s.config.tagline?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [sets, search]);

  const loading = status === "loading" && sets.length === 0;
  const empty = status === "ready" && sets.length === 0;

  return (
    <div className="bg-textured flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 pr-14">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/agents/all")}
          aria-label="Back to agents"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Agent Sets</h1>
            <p className="text-[11px] text-muted-foreground">
              Orchestrators presiding over teams of agents
            </p>
          </div>
        </div>

        <div className="relative ml-auto hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets…"
            className="h-9 w-56 pl-8"
          />
        </div>
        <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New set
        </Button>
        <Button onClick={() => setGenerateOpen(true)} className="gap-1.5">
          <Workflow className="h-4 w-4" />
          Generate orchestrator
        </Button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        )}

        {empty && (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Network className="h-7 w-7" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Build your first agent set
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Don&apos;t have an orchestrator yet? Pick the specialists you want and
              we&apos;ll generate one for you — an agent that knows each member and
              coordinates them. Or use an agent you already have.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setGenerateOpen(true)} className="gap-1.5">
                <Workflow className="h-4 w-4" />
                Generate an orchestrator
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Use an existing agent
              </Button>
            </div>
          </div>
        )}

        {!loading && !empty && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => (
              <AgentSetCard key={s.orchestratorId} summary={s} />
            ))}
            {filtered.length === 0 && (
              <div className={cn("col-span-full py-16 text-center text-sm text-muted-foreground")}>
                No sets match “{search}”.
              </div>
            )}
          </div>
        )}
      </div>

      <CreateSetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onGenerateInstead={() => {
          setCreateOpen(false);
          setGenerateOpen(true);
        }}
      />
      <GenerateOrchestratorDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
