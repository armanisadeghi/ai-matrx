// features/agents/agent-sets/components/SetBuilder.tsx
//
// The /agents/sets/[orchestratorId] builder shell. Composes the agent library
// rail, the spatial canvas (or sortable grid), and the member inspector around
// one orchestrator. Owns view + selection + settings; all data mutation flows
// through the agentSets thunks.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  LayoutGrid,
  Loader2,
  MousePointerClick,
  Network,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { useAgentSet } from "../hooks/useAgentSet";
import { useEnsureAgentsLoaded } from "../hooks/useEnsureAgentsLoaded";
import { useOrchestratorPromptStatus } from "../hooks/useOrchestratorPromptStatus";
import { addAgentToSet, createAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import { syncOrchestratorPrompt } from "../orchestrator/thunks";
import { AgentLibraryRail } from "./AgentLibraryRail";
import SetBuilderCanvas from "./SetBuilderCanvas";
import { SetMemberGrid } from "./SetMemberGrid";
import { MemberInspector } from "./MemberInspector";
import { SetSettingsDialog } from "./SetSettingsDialog";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT } from "../constants";

export function SetBuilder({ orchestratorId }: { orchestratorId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { members, config, label, exists, status } = useAgentSet(orchestratorId);
  const orchestrator = useAppSelector((s) => selectAgentById(s, orchestratorId));
  const accent = config.accent ?? DEFAULT_SET_ACCENT;
  const a = accentClasses(accent);

  const [view, setView] = useState<"canvas" | "grid">("canvas");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEnsureAgentsLoaded();

  const memberIds = useMemo(() => members.map((m) => m.agentId), [members]);
  const promptStatus = useOrchestratorPromptStatus(orchestratorId, memberIds);
  // Derived — when a member is removed it simply resolves to null and the
  // inspector unmounts (no setState-in-effect cleanup needed).
  const editingMember = editingId ? members.find((m) => m.agentId === editingId) ?? null : null;
  const title = label?.trim() || orchestrator?.name || "Agent Set";

  const handleAdd = (agentId: string) => dispatch(addAgentToSet({ orchestratorId, agentId }));

  const handleSyncPrompt = async () => {
    setSyncing(true);
    const res = await dispatch(syncOrchestratorPrompt({ orchestratorId, memberIds }));
    setSyncing(false);
    if (res.ok) toast.success("Orchestrator prompt synced with the current members.");
    else toast.error(res.error ?? "Could not sync the orchestrator prompt.");
  };

  const loading = status === "idle" || (status === "loading" && members.length === 0 && !exists);

  if (loading) {
    return (
      <div className="bg-textured flex h-[calc(100vh-2.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The agent is not (yet) an orchestrator — offer to make it one.
  if (status === "ready" && !exists && members.length === 0) {
    return (
      <div className="bg-textured flex h-[calc(100vh-2.5rem)] flex-col items-center justify-center p-6 text-center">
        <div className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-2xl", a.glyph)}>
          <Network className="h-7 w-7" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Make {orchestrator?.name ?? "this agent"} an orchestrator?
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          It will preside over a set of agents you assemble — each filling a gap in
          the bigger picture.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/agents/sets")}>
            Cancel
          </Button>
          <Button
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              const res = await dispatch(createAgentSet({ orchestratorId, config: { accent } }));
              setCreating(false);
              if (!res.ok) router.push("/agents/sets");
            }}
          >
            {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create set
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-textured flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden">
      {/* header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5 pr-14">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/agents/sets")}
          aria-label="Back to sets"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shadow-sm", a.glyph)}>
          <Network className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground" title={title}>
            {title}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {members.length} {members.length === 1 ? "agent" : "agents"}
            {config.tagline ? ` · ${config.tagline}` : ""}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* view toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("canvas")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === "canvas"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Network className="h-3.5 w-3.5" /> Canvas
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
          </div>

          {/* Only for TEMPLATE orchestrators (their prompt has the <available_agents>
              section our system fills). The amber pulse flags "listings ≠ members". */}
          {promptStatus.isTemplate && (
            <Button
              variant={promptStatus.outOfSync ? "default" : "outline"}
              size="sm"
              className="relative gap-1.5"
              onClick={handleSyncPrompt}
              disabled={syncing || members.length === 0}
              title="Regenerate the orchestrator's <available_agents> prompt to match the current members"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync agent listings
              {promptStatus.outOfSync && !syncing && (
                <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
              )}
            </Button>
          )}
          <Link href={`/agents/${orchestratorId}/build`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Orchestrator
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Set settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* body */}
      <div className="flex flex-1 overflow-hidden">
        <AgentLibraryRail
          orchestratorId={orchestratorId}
          memberIds={memberIds}
          onAdd={handleAdd}
        />

        <main className="relative flex-1 overflow-hidden">
          {view === "canvas" ? (
            <SetBuilderCanvas
              orchestratorId={orchestratorId}
              accent={accent}
              members={members}
              config={config}
              onEditMember={setEditingId}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              {members.length === 0 ? null : (
                <SetMemberGrid
                  orchestratorId={orchestratorId}
                  members={members}
                  accent={accent}
                  onEdit={setEditingId}
                />
              )}
            </div>
          )}

          {members.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/70 px-6 py-5 text-center backdrop-blur">
                <MousePointerClick className="h-5 w-5 text-muted-foreground" />
                <p className="max-w-[15rem] text-xs text-muted-foreground">
                  Drag agents from the library — or click one — to add them to this set.
                </p>
              </div>
            </div>
          )}
        </main>

        {editingMember && (
          <MemberInspector
            key={editingMember.agentId}
            orchestratorId={orchestratorId}
            member={editingMember}
            accent={accent}
            onClose={() => setEditingId(null)}
          />
        )}
      </div>

      <SetSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        orchestratorId={orchestratorId}
        label={label}
        config={config}
        orchestratorName={orchestrator?.name ?? "this agent"}
        onDeleted={() => router.push("/agents/sets")}
      />
    </div>
  );
}
