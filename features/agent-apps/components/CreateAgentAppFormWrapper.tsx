"use client";

/**
 * CreateAgentAppFormWrapper — single mode-selection surface for new apps.
 *
 * One 6-card grid (replaces the legacy Auto/Manual top-tab split). Each
 * card routes to its own sub-flow without leaving the page. Cards 1–3
 * mount the existing AutoCreate flow at a specific sub-mode; cards 4–6
 * are the new shell-based paths.
 *
 * Data fetching is on-demand:
 *  - With `?agent_id=<id>`: no list is fetched. The chosen agent's full
 *    row is loaded lazily the first time a card that needs it is clicked.
 *  - Without it: a thin agent list is pulled from Redux for the picker.
 *    When the user picks one, the full row is fetched on demand.
 *
 * What's NOT in this file: the AI code-gen logic. That stays in
 * AutoCreateAgentAppForm + useAutoCreateApp. We just wire to it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Code2,
  Layers,
  Layout,
  Loader2,
  MessageSquare,
  MousePointerClick,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { CreateAgentAppForm } from "./CreateAgentAppForm";
import { AutoCreateAgentAppForm } from "./AutoCreateAgentAppForm";
import {
  SearchableAgentSelect,
  type AgentOption,
} from "./SearchableAgentSelect";
import { selectLiveAgents, selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchAgentsListFull,
  fetchFullAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import { supabase } from "@/utils/supabase/client";
import {
  generateSlugCandidates,
  validateSlugsInBatch,
} from "../services/slug-service";
import type { CreateAgentAppInput } from "../types";

interface CreateAgentAppFormWrapperProps {
  preselectedAgentId?: string | null;
  onSuccess?: () => void;
}

type Mode =
  | "grid"
  | "auto-fire"
  | "auto-select"
  | "auto-describe"
  | "live-builder"
  | "standard-chat"
  | "manual";

export function CreateAgentAppFormWrapper({
  preselectedAgentId,
  onSuccess,
}: CreateAgentAppFormWrapperProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [mode, setMode] = useState<Mode>("grid");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    preselectedAgentId ?? undefined,
  );
  // The raw `agx_agent` row we feed downstream (AutoCreate's AI prompt
  // expects the raw DB shape). Loaded on-demand the first time a card
  // that needs it is clicked.
  const [agentRow, setAgentRow] = useState<any>(null);
  const [agentRowLoading, setAgentRowLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Thin list for the picker — only fetched when no agent is preselected.
  const liveAgents = useAppSelector(selectLiveAgents);
  const agentInRedux = useAppSelector((state) =>
    selectedAgentId ? selectAgentById(state, selectedAgentId) : undefined,
  );

  useEffect(() => {
    if (preselectedAgentId) return;
    if (liveAgents.length > 0) return;
    void dispatch(fetchAgentsListFull());
  }, [preselectedAgentId, liveAgents.length, dispatch]);

  // Thin AgentOption[] for SearchableAgentSelect (id/name/description/category/isPublic).
  const agentOptions: AgentOption[] = useMemo(
    () =>
      liveAgents
        .filter((a) => !a.isArchived)
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description ?? null,
          category: a.category ?? null,
          isPublic: !!a.isPublic,
        })),
    [liveAgents],
  );

  /**
   * Lazily fetch the full raw agx_agent row for the selected agent.
   * AutoCreate's AI builtin gets the raw row JSON-stringified — we keep
   * that shape byte-identical to today so the model prompt is unaffected.
   */
  const ensureAgentRow = useCallback(
    async (id: string): Promise<any | null> => {
      if (agentRow && agentRow.id === id) return agentRow;
      setAgentRowLoading(true);
      try {
        const { data, error } = await (
          supabase as unknown as {
            from: (t: string) => {
              select: (s: string) => {
                eq: (
                  c: string,
                  v: string,
                ) => {
                  single: () => Promise<{ data: any; error: any }>;
                };
              };
            };
          }
        )
          .from("agx_agent")
          .select("*")
          .eq("id", id)
          .single();
        if (error) {
          toast.error(`Failed to load agent: ${error.message}`);
          return null;
        }
        setAgentRow(data);
        // Also keep Redux warm for downstream selectors.
        void dispatch(fetchFullAgent(id));
        return data;
      } finally {
        setAgentRowLoading(false);
      }
    },
    [agentRow, dispatch],
  );

  const handlePickerChange = (id: string) => {
    setSelectedAgentId(id);
    setAgentRow(null); // invalidate; re-fetched when needed
  };

  // ── Manual submit (Build Manually card) ─────────────────────────────────
  const handleManualSubmit = async (input: CreateAgentAppInput) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/agent-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      onSuccess?.();
      router.push(`/agent-apps/${created.id}/run`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create app",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Standard Chat Layout (one-click create with hardcoded defaults) ────
  const handleStandardChatCreate = async () => {
    if (!selectedAgentId) return;
    setSubmitting(true);
    try {
      // Use the agent's display name if we have it (preselected or in
      // Redux from the thin list); fall back to a generic title so we
      // never block on a name lookup.
      const agentName =
        agentInRedux?.name ??
        agentRow?.name ??
        "App";
      const baseName = `${agentName} App`;

      // Auto-slug with collision check.
      const candidates = generateSlugCandidates(baseName);
      let chosenSlug = candidates[0] ?? "app";
      try {
        const { available } = await validateSlugsInBatch(candidates.slice(0, 5));
        chosenSlug = available[0] ?? `${candidates[0]}-${Math.floor(Math.random() * 900) + 100}`;
      } catch {
        chosenSlug = `${candidates[0]}-${Math.floor(Math.random() * 900) + 100}`;
      }

      const res = await fetch("/api/agent-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          slug: chosenSlug,
          name: baseName,
          shell_kind: "chat",
          shell_config: {
            autoRun: false,
            allowChat: true,
            historyView: "sidebar",
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      toast.success("App created.");
      onSuccess?.();
      router.push(`/agent-apps/${created.id}/run`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create app",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Card handlers ──────────────────────────────────────────────────────
  const handleCardClick = async (next: Mode) => {
    if (!selectedAgentId) return;
    // The AI-driven cards (1-3) need the full agent row for the prompt
    // builtin. Standard Chat / Manual / Live Builder either don't need it
    // or only need name (already in Redux thin list).
    if (
      next === "auto-fire" ||
      next === "auto-select" ||
      next === "auto-describe"
    ) {
      const row = await ensureAgentRow(selectedAgentId);
      if (!row) return;
    }
    if (next === "standard-chat") {
      void handleStandardChatCreate();
      return;
    }
    setMode(next);
  };

  const backToGrid = () => setMode("grid");

  // ── Render ─────────────────────────────────────────────────────────────

  const hidePicker = !!preselectedAgentId;
  // The visible title uses Redux thin info; if it's a fresh preselected
  // agent and Redux hasn't been seeded, we leave the name space blank
  // (avoids the "loading…" flash for a sub-300ms fetch).
  const agentDisplayName = agentInRedux?.name ?? agentRow?.name ?? "";

  if (mode !== "grid") {
    return (
      <div className="w-full space-y-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={backToGrid}
            disabled={submitting}
            className="gap-2 text-muted-foreground"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            All options
          </Button>
        </div>

        {mode === "auto-fire" && (
          <AutoCreateAgentAppForm
            agent={agentRow}
            agents={[]}
            categories={[]}
            initialMode="auto-fire"
            onBack={backToGrid}
            onSuccess={onSuccess}
          />
        )}
        {mode === "auto-select" && (
          <AutoCreateAgentAppForm
            agent={agentRow}
            agents={[]}
            categories={[]}
            initialMode="select"
            onBack={backToGrid}
            onSuccess={onSuccess}
          />
        )}
        {mode === "auto-describe" && (
          <AutoCreateAgentAppForm
            agent={agentRow}
            agents={[]}
            categories={[]}
            initialMode="describe"
            onBack={backToGrid}
            onSuccess={onSuccess}
          />
        )}
        {mode === "live-builder" && (
          <div className="max-w-2xl mx-auto text-center py-16 space-y-3">
            <Layout className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-2xl font-semibold">Live Builder</h2>
            <p className="text-sm text-muted-foreground">
              Coming next — split-pane builder with real-time preview against
              the shell library.
            </p>
          </div>
        )}
        {mode === "manual" && (
          <CreateAgentAppForm
            agents={agentOptions}
            onSubmit={handleManualSubmit}
            onCancel={backToGrid}
            busy={submitting}
            defaultAgentId={selectedAgentId ?? null}
            defaultName={agentDisplayName}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {!hidePicker && (
        <div className="space-y-3 max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Select Your Agent</Label>
            {agentOptions.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {agentOptions.length} agent
                {agentOptions.length !== 1 ? "s" : ""} available
              </span>
            )}
          </div>
          <SearchableAgentSelect
            agents={agentOptions}
            value={selectedAgentId ?? null}
            onChange={handlePickerChange}
            placeholder="Choose the agent to power your app..."
          />
        </div>
      )}

      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold">
          Create Your Custom{" "}
          {agentDisplayName && (
            <span className="text-primary">{agentDisplayName} </span>
          )}
          App
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
        <ModeCard
          icon={<Rocket className="w-8 h-8 text-white" />}
          iconBg="from-green-500 to-emerald-500"
          title="Let Us Handle It"
          description="We'll create the perfect app for you using smart defaults. Just click and go!"
          tag={{ icon: <Rocket className="w-3.5 h-3.5" />, text: "Fastest option", className: "text-success" }}
          onClick={() => handleCardClick("auto-fire")}
          disabled={!selectedAgentId || agentRowLoading || submitting}
          loading={agentRowLoading && mode === "grid"}
        />
        <ModeCard
          icon={<Layers className="w-8 h-8 text-white" />}
          iconBg="from-blue-500 to-purple-500"
          title="Customize Options"
          description="Choose from preset options to make it easier to guide the AI."
          tag={{ icon: <Sparkles className="w-3.5 h-3.5" />, text: "Most popular", className: "text-primary" }}
          onClick={() => handleCardClick("auto-select")}
          disabled={!selectedAgentId || agentRowLoading || submitting}
        />
        <ModeCard
          icon={<MessageSquare className="w-8 h-8 text-white" />}
          iconBg="from-orange-500 to-pink-500"
          title="Describe Your Vision"
          description="Tell us what you want in plain English. Voice or text. We'll do the rest."
          tag={{ icon: <Rocket className="w-3.5 h-3.5" />, text: "Most flexible", className: "text-muted-foreground" }}
          onClick={() => handleCardClick("auto-describe")}
          disabled={!selectedAgentId || agentRowLoading || submitting}
        />
        <ModeCard
          icon={<Layout className="w-8 h-8 text-white" />}
          iconBg="from-cyan-500 to-sky-500"
          title="Live Builder"
          description="Pick a layout and watch it render in real time. No code generation — just pick and ship."
          tag={{ icon: <Sparkles className="w-3.5 h-3.5" />, text: "No code", className: "text-cyan-500" }}
          onClick={() => handleCardClick("live-builder")}
          disabled={!selectedAgentId || submitting}
        />
        <ModeCard
          icon={<MousePointerClick className="w-8 h-8 text-white" />}
          iconBg="from-fuchsia-500 to-rose-500"
          title="Standard Chat Layout"
          description="One click. Full chat UI with history and follow-up turns, ready to run."
          tag={{ icon: <Rocket className="w-3.5 h-3.5" />, text: "One click", className: "text-rose-500" }}
          onClick={() => handleCardClick("standard-chat")}
          disabled={!selectedAgentId || submitting}
          loading={submitting && mode === "grid"}
        />
        <ModeCard
          icon={<Wrench className="w-8 h-8 text-white" />}
          iconBg="from-slate-500 to-zinc-500"
          title="Build Manually"
          description="Full control over name, slug, display mode, and starter code. For power users."
          tag={{ icon: <Code2 className="w-3.5 h-3.5" />, text: "Power user", className: "text-muted-foreground" }}
          onClick={() => handleCardClick("manual")}
          disabled={!selectedAgentId || submitting}
        />
      </div>

      {!selectedAgentId && !hidePicker && (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            Select an agent above to enable these options.
          </p>
        </div>
      )}
    </div>
  );
}

interface ModeCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  tag: { icon: React.ReactNode; text: string; className?: string };
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function ModeCard({
  icon,
  iconBg,
  title,
  description,
  tag,
  onClick,
  disabled,
  loading,
}: ModeCardProps) {
  return (
    <Card
      className={cn(
        "transition-all group",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:shadow-lg hover:scale-[1.02]",
      )}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      <CardContent className="p-6 space-y-4">
        <div
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br mx-auto",
            iconBg,
          )}
        >
          {loading ? (
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          ) : (
            icon
          )}
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div
          className={cn(
            "flex items-center justify-center gap-2 text-xs font-medium pt-2",
            tag.className,
          )}
        >
          {tag.icon}
          <span>{tag.text}</span>
        </div>
      </CardContent>
    </Card>
  );
}
