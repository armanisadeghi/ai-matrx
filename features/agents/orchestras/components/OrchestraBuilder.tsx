// features/agents/agent-sets/components/SetBuilder.tsx
//
// The /agents/sets/[orchestratorId] builder shell. Composes the agent library
// rail, the spatial canvas (or sortable grid), and the member inspector around
// one orchestrator. Owns view + selection + settings; all data mutation flows
// through the agentSets thunks.

"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  LayoutGrid,
  Loader2,
  MousePointerClick,
  Network,
  PanelLeft,
  Play,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  EntityModeHeader,
  type EntityHeaderAction,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import { useAgentSet } from "../hooks/useAgentSet";
import { useAgentSetsList } from "../hooks/useAgentSetsList";
import { useEnsureAgentsLoaded } from "../hooks/useEnsureAgentsLoaded";
import { useOrchestratorPromptStatus } from "../hooks/useOrchestratorPromptStatus";
import { addAgentToSet, createAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import { enableOrchestratorSync, syncOrchestratorPrompt } from "../orchestrator/thunks";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { selectDisplayConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { SetRunStatusContext } from "../run/SetRunStatusContext";
import { useSetMemberRunStatus } from "../run/useSetMemberRunStatus";
import { AgentLibraryRail } from "./AgentLibraryRail";
import SetBuilderCanvas from "./SetBuilderCanvas";
import { SetMemberGrid } from "./SetMemberGrid";
import { MemberInspector } from "./MemberInspector";
import { OrchestratorInspector } from "./OrchestratorInspector";
import { SetSettingsDialog } from "./SetSettingsDialog";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT } from "../constants";

// Loaded only when the user opens the embedded run panel — it drags the whole
// conversation runtime with it (see SetRunPanel's own dynamic AgentRunnerPage).
const SetRunPanel = dynamic(
  () => import("../run/SetRunPanel").then((m) => m.SetRunPanel),
  { ssr: false },
);

export function SetBuilder({ orchestratorId }: { orchestratorId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { members, config, label, exists, status } = useAgentSet(orchestratorId);
  const orchestrator = useAppSelector((s) => selectAgentById(s, orchestratorId));
  const accent = config.accent ?? DEFAULT_SET_ACCENT;
  const a = accentClasses(accent);

  // The canvas/grid choice lives in the URL so the header's ONE mode nav (and
  // its mobile drawer) can drive it like any other sub-view.
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "grid" ? "grid" : "canvas";
  const basePath = `/agents/sets/${orchestratorId}`;

  // The library rail is a static column on desktop and a slide-over below md —
  // 16rem of fixed rail on a phone left the canvas unusable. `null` = follow the
  // viewport default; the header toggle takes over once the user decides.
  const isMobile = useIsMobile();
  const [libraryOverride, setLibraryOverride] = useState<boolean | null>(null);
  const libraryOpen = libraryOverride ?? !isMobile;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  // The embedded run experience (desktop): AgentRunnerPage co-mounted with the
  // canvas so member nodes light up live. Mutually exclusive with the member /
  // orchestrator inspectors — one right-side panel at a time.
  const [runOpen, setRunOpen] = useState(false);
  // The right-side panel shows a member, the orchestrator, or the run — never two.
  const openMember = (agentId: string) => {
    setOrchestratorOpen(false);
    setRunOpen(false);
    setEditingId(agentId);
  };
  const openOrchestrator = () => {
    setEditingId(null);
    setRunOpen(false);
    setOrchestratorOpen(true);
  };
  const openRun = () => {
    setEditingId(null);
    setOrchestratorOpen(false);
    setRunOpen(true);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [enablingSync, setEnablingSync] = useState(false);
  const openAgentContentWindow = useOpenAgentContentWindow();

  useEnsureAgentsLoaded();
  // Sibling sets power the header's entity dropdown (switch set without a round trip to the list).
  const { sets } = useAgentSetsList();

  const memberIds = useMemo(() => members.map((m) => m.agentId), [members]);
  const promptStatus = useOrchestratorPromptStatus(orchestratorId, memberIds);

  // ── live member highlight ──────────────────────────────────────────────
  // The embedded runner registers under this surfaceKey; the focus registry is
  // the canonical way to observe its active conversation (no runner fork).
  // Observed even while the panel is closed — a still-streaming run keeps
  // lighting the canvas after the user closes the panel (retainOnUnmount).
  const runSurfaceKey = `agent-set-builder:${orchestratorId}`;
  const runConversationId = useAppSelector(selectDisplayConversation(runSurfaceKey));
  const runStatus = useSetMemberRunStatus(runConversationId, memberIds);
  // Derived — when a member is removed it simply resolves to null and the
  // inspector unmounts (no setState-in-effect cleanup needed).
  const editingMember = editingId ? members.find((m) => m.agentId === editingId) ?? null : null;
  const title = label?.trim() || orchestrator?.name || "Agent Set";

  const handleAdd = (agentId: string) => dispatch(addAgentToSet({ orchestratorId, agentId }));

  const handleSyncPrompt = async () => {
    setSyncing(true);
    const res = await dispatch(syncOrchestratorPrompt({ orchestratorId, memberIds }));
    setSyncing(false);
    if (res.ok) {
      const updated = res.membersUpdated ?? 0;
      toast.success(
        updated > 0
          ? `Synced — updated the role for ${updated} agent${updated === 1 ? "" : "s"} and refreshed the orchestrator listing.`
          : "Synced — member roles confirmed and the orchestrator listing refreshed.",
      );
    } else toast.error(res.error ?? "Could not sync the orchestrator prompt.");
  };

  // The orchestrator's prompt has no <available_agents> section, so syncing is
  // impossible. One click adds the section, then opens the System Instructions
  // editor (only that tab) so the user can see/adjust it. After that the normal
  // "Sync agent listings" action appears.
  const handleEnableSync = async () => {
    setEnablingSync(true);
    const res = await dispatch(enableOrchestratorSync({ orchestratorId }));
    setEnablingSync(false);
    if (res.ok) {
      openAgentContentWindow({
        initialAgentId: orchestratorId,
        initialTab: "system",
        tabs: ["system"],
      });
      toast.success(
        "Added an <available_agents> section to the system prompt — opened it for review. Use 'Sync agent listings' to fill it from your members.",
      );
    } else {
      toast.error(res.error ?? "Could not set up syncing for this orchestrator.");
    }
  };

  const loading = status === "idle" || (status === "loading" && members.length === 0 && !exists);

  if (loading) {
    return (
      <div className="bg-textured flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The agent is not (yet) an orchestrator — offer to make it one.
  if (status === "ready" && !exists && members.length === 0) {
    return (
      <div className="bg-textured flex h-full flex-col items-center justify-center p-6 pt-[var(--shell-header-h)] text-center">
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

  const headerActions: EntityHeaderAction[] = [
    {
      label: libraryOpen ? "Hide agent library" : "Show agent library",
      icon: PanelLeft,
      onPress: () => setLibraryOverride(!libraryOpen),
    },
    // Desktop opens the embedded run panel beside the canvas (live member
    // highlight); mobile keeps the full runner route — canvas highlight is
    // meaningless on a phone.
    isMobile
      ? {
          label: "Run",
          icon: Play,
          primary: true,
          href: `/agents/${orchestratorId}/run`,
        }
      : {
          label: runOpen ? "Hide run panel" : "Run",
          icon: Play,
          primary: !runOpen,
          onPress: () => (runOpen ? setRunOpen(false) : openRun()),
        },
    // TEMPLATE orchestrators (prompt HAS the <available_agents> section our
    // system fills) → the Sync action; out-of-sync promotes it to a solid pill.
    ...(promptStatus.isTemplate
      ? [
          {
            label: syncing ? "Syncing agent listings" : "Sync agent listings",
            icon: syncing ? Loader2 : RefreshCw,
            onPress: handleSyncPrompt,
            primary: promptStatus.outOfSync,
            disabled: syncing || members.length === 0,
          } satisfies EntityHeaderAction,
        ]
      : []),
    // Loaded but NOT a template — the prompt has no <available_agents> section,
    // so syncing is impossible. Instead of silently hiding everything, show a
    // yellow "Enable sync" action that adds the section in one click and opens
    // the system prompt for review.
    ...(promptStatus.ready && !promptStatus.isTemplate
      ? [
          {
            label: enablingSync ? "Enabling sync" : "Enable sync",
            icon: enablingSync ? Loader2 : AlertTriangle,
            onPress: handleEnableSync,
            warning: true,
            disabled: enablingSync,
          } satisfies EntityHeaderAction,
        ]
      : []),
    {
      label: "Orchestrator",
      icon: ExternalLink,
      href: `/agents/${orchestratorId}/build`,
      newTab: true,
    },
    { label: "Set settings", icon: Settings2, onPress: () => setSettingsOpen(true) },
  ];

  return (
    <div className="bg-textured flex h-full flex-col overflow-hidden">
      <EntityModeHeader
        backHref="/agents/sets"
        entityLabel={title}
        entityOptions={sets.map((s) => ({
          label: s.label?.trim() || s.name,
          href: `/agents/sets/${s.orchestratorId}`,
          active: s.orchestratorId === orchestratorId,
        }))}
        modes={[
          { name: "Canvas", href: basePath, icon: Network },
          { name: "Grid", href: `${basePath}?view=grid`, icon: LayoutGrid },
        ]}
        activeModeHref={view === "grid" ? `${basePath}?view=grid` : basePath}
        actions={headerActions}
      />

      {/* body — builder chrome (rail search, canvas Arrange panel) is static top
          UI, so it clears the glass header instead of scrolling behind it. */}
      <div className="flex flex-1 overflow-hidden pt-[var(--shell-header-h)]">
        {libraryOpen && isMobile && (
          <button
            type="button"
            aria-label="Close agent library"
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setLibraryOverride(false)}
          />
        )}
        {libraryOpen && (
          <div
            className={cn(
              isMobile &&
                // Opaque: the rail's own bg-card/40 is a tint, not a surface —
                // as a slide-over it would show the canvas straight through.
                "fixed bottom-0 left-0 top-[var(--shell-header-h)] z-40 bg-background shadow-2xl pb-[env(safe-area-inset-bottom)]",
            )}
          >
            <AgentLibraryRail
              orchestratorId={orchestratorId}
              memberIds={memberIds}
              onAdd={handleAdd}
            />
          </div>
        )}

        <main className="relative flex-1 overflow-hidden">
          <SetRunStatusContext.Provider value={runStatus}>
            {view === "canvas" ? (
              <SetBuilderCanvas
                orchestratorId={orchestratorId}
                accent={accent}
                members={members}
                config={config}
                onEditMember={openMember}
                onOpenOrchestrator={openOrchestrator}
              />
            ) : (
              <div className="h-full overflow-y-auto">
                {members.length === 0 ? null : (
                  <SetMemberGrid
                    orchestratorId={orchestratorId}
                    members={members}
                    accent={accent}
                    onEdit={openMember}
                    onOpenOrchestrator={openOrchestrator}
                  />
                )}
              </div>
            )}
          </SetRunStatusContext.Provider>

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

        {orchestratorOpen && (
          <OrchestratorInspector
            orchestratorId={orchestratorId}
            accent={accent}
            onClose={() => setOrchestratorOpen(false)}
          />
        )}

        {runOpen && !isMobile && (
          <SetRunPanel
            orchestratorId={orchestratorId}
            surfaceKey={runSurfaceKey}
            accent={accent}
            conversationId={runConversationId}
            onClose={() => setRunOpen(false)}
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
