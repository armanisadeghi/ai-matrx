"use client";

/**
 * CONTEXT BUILDER — the surface where a human decides what an agent reads.
 *
 * Everything a research topic holds is listed here with its real size, checked
 * on or off, saved as a reusable bundle, and handed to any agent. That last part
 * is the point: the same curation feeds a built-in output (brand profile, gap
 * analysis) and a user's own agent, because they consume the identical bundle →
 * variables path. There is no "system" route and "user" route.
 *
 * Layout is two columns on desktop: the inventory on the left (what exists), the
 * consequences on the right (what it costs, what the agent will actually get,
 * and the run). Both halves are always visible — deciding what to include IS
 * reading the cost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ListTree,
  Loader2,
  RefreshCw,
  Play,
  AlertTriangle,
  Cpu,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  selectLiveAgents,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchAgentsListFull,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useTopicContext } from "../../context/ResearchContext";
import {
  bundleDeliveries,
  bundleToSelection,
  bundleVariables,
  selectionToBundle,
  useContextBuilder,
} from "../../hooks/useContextBuilder";
import { resolveBundle } from "../../resources/resolve";
import { kindDef } from "../../resources/catalog";
import {
  createBundle,
  listBundlesForTopic,
  updateBundle,
  deleteBundle,
} from "../../service/resources";
import type { ContextBundle } from "../../resources/types";
import { ResourcePicker } from "./ResourcePicker";
import { BudgetMeter } from "./BudgetMeter";
import { BundleBar } from "./BundleBar";
import { VariablePreview } from "./VariablePreview";

/** What the agent is asked to do when the user does not say otherwise. */
/** The research surface, for agent-surface binding value mappings. */
const RESEARCH_SURFACE_NAME = "matrx-user/research";

const DEFAULT_INSTRUCTION =
  "Produce your standard output using the research provided in the variables. Ground every claim in that material and name what is missing rather than filling gaps.";

export default function ContextBuilder() {
  const { topicId, topic } = useTopicContext();
  const builder = useContextBuilder(topicId);
  const dispatch = useAppDispatch();

  const [bundles, setBundles] = useState<ContextBundle[]>([]);
  const [loaded, setLoaded] = useState<ContextBundle | null>(null);
  const [saving, setSaving] = useState(false);
  /** Agent the loaded bundle was authored for — preselects the runner. */
  const [suggestedAgentId, setSuggestedAgentId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const requestedSlug = searchParams.get("bundle");
  /** Consumed once by the first bundle load that can satisfy it. */
  const pendingSlugRef = useRef<string | null>(requestedSlug);
  /** Set below; lets the loader call the applier without ordering games. */
  const applyBundleRef = useRef<((b: ContextBundle) => void) | null>(null);

  /**
   * Load the saved selections, and — on the FIRST load that can satisfy it —
   * apply the `?bundle=<slug>` deep link.
   *
   * The apply happens here, in the promise callback where the data actually
   * arrives, rather than in an effect watching `bundles`. An effect that calls
   * setState synchronously is a cascading render (react-hooks/set-state-in-effect),
   * and this is not a synchronisation problem: it is "when the list lands, if a
   * slug was requested, select it once".
   */
  const reloadBundles = useCallback(() => {
    listBundlesForTopic(topicId)
      .then((loaded) => {
        setBundles(loaded);
        const slug = pendingSlugRef.current;
        if (!slug) return;
        pendingSlugRef.current = null;
        const match = loaded.find((b) => b.slug === slug);
        if (match) applyBundleRef.current?.(match);
        else toast.error(`No saved selection named "${slug}"`);
      })
      .catch((e: unknown) => {
        toast.error(
          e instanceof Error ? e.message : "Could not load saved selections",
        );
      });
  }, [topicId]);

  useEffect(reloadBundles, [reloadBundles]);

  const selectionCount = builder.selection.size;

  // "Edited" must mean the user changed something.
  //
  // Comparing the draft's selectors to the SAVED json directly reports "edited"
  // the instant a bundle loads, because loading round-trips through the editor's
  // state shape (mode normalization, topN moving in and out of `filter`, catalog
  // ordering) and comes back equivalent-but-not-identical. A badge that says
  // "edited" when nothing was edited trains the user to ignore it, and the next
  // real unsaved change goes unnoticed.
  //
  // So both sides are put through the SAME normalization — the saved bundle is
  // round-tripped exactly as the loaded one was — and only then compared.
  const dirty = useMemo(() => {
    if (!loaded) return selectionCount > 0;
    const normalized = selectionToBundle(bundleToSelection(loaded), {
      topicId,
      maxTokens: loaded.budget?.maxTokens ?? null,
      variables: bundleVariables(loaded),
      deliveries: bundleDeliveries(loaded),
    });
    // Bindings are compared too: switching a kind between inject and lazy
    // context changes only the binding, and that IS an unsaved edit.
    return (
      JSON.stringify([builder.draft.selectors, builder.draft.bindings]) !==
      JSON.stringify([normalized.selectors, normalized.bindings])
    );
  }, [loaded, builder.draft.selectors, builder.draft.bindings, selectionCount, topicId]);

  const applyBundle = (bundle: ContextBundle) => {
    builder.setSelection(bundleToSelection(bundle));
    builder.setDeliveries(bundleDeliveries(bundle));
    for (const [kind, variable] of Object.entries(bundleVariables(bundle))) {
      if (variable) {
        builder.setVariable(kind as Parameters<typeof builder.setVariable>[0], variable);
      }
    }
    if (bundle.budget) builder.setBudgetTokens(bundle.budget.maxTokens);
    if (bundle.agentId) setSuggestedAgentId(bundle.agentId);
    setLoaded(bundle);
    toast.success(`Loaded "${bundle.name}"`);
  };

  // Kept current in an effect (a ref may not be written during render). This
  // effect is declared BEFORE the loader effect below, so the ref is always set
  // by the time a bundle list can arrive.
  useEffect(() => {
    applyBundleRef.current = applyBundle;
  });

  const handleSave = async () => {
    if (!loaded || loaded.isSystem) return;
    setSaving(true);
    try {
      const saved = await updateBundle(loaded.id, {
        name: loaded.name,
        selectors: builder.draft.selectors,
        bindings: builder.draft.bindings,
        budget: builder.draft.budget,
      });
      setLoaded(saved);
      reloadBundles();
      toast.success("Selection saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async (name: string, asTemplate: boolean) => {
    setSaving(true);
    try {
      const saved = await createBundle({
        name,
        entityId: asTemplate ? null : topicId,
        selectors: builder.draft.selectors,
        bindings: builder.draft.bindings,
        budget: builder.draft.budget,
        organizationId: topic?.organization_id ?? null,
      });
      setLoaded(saved);
      reloadBundles();
      toast.success(
        asTemplate ? "Saved as a reusable template" : "Saved for this topic",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bundle: ContextBundle) => {
    try {
      await deleteBundle(bundle.id);
      if (loaded?.id === bundle.id) setLoaded(null);
      reloadBundles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  useEffect(() => {
    void dispatch(fetchAgentsListFull());
  }, [dispatch]);

  if (builder.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading everything this topic holds…
        </div>
      </div>
    );
  }

  if (builder.error || !builder.manifest) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-lg rounded-xl border border-destructive/40 bg-destructive/[0.06] p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Could not load this topic&apos;s resources
          </div>
          <p className="mt-1 text-xs">{builder.error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={builder.reload}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const manifest = builder.manifest;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
            <ListTree className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground/80">
              Context Builder
            </span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              Choose exactly what an agent reads
            </span>
          </div>
          <BundleBar
            bundles={bundles}
            loaded={loaded}
            dirty={dirty}
            saving={saving}
            onLoad={applyBundle}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onDelete={handleDelete}
            selectionCount={selectionCount}
          />
          <div className="ml-auto flex items-center gap-1.5">
            {selectionCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => {
                  builder.clear();
                  builder.setDeliveries({});
                  setLoaded(null);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={builder.reload}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ResourcePicker
            manifest={manifest}
            selection={builder.selection}
            deliveries={builder.deliveries}
            onToggleKind={builder.toggleKind}
            onToggleItem={builder.toggleItem}
            onPatchKind={builder.patchKind}
            onSetDelivery={builder.setDelivery}
          />

          <div className="space-y-3 lg:sticky lg:top-2 lg:self-start">
            <BudgetMeter
              chars={builder.preview?.chars ?? 0}
              tokens={builder.preview?.tokens ?? 0}
              budgetTokens={builder.budgetTokens}
              onBudgetChange={builder.setBudgetTokens}
              perKind={builder.preview?.perKind ?? []}
              droppedByBudget={builder.preview?.droppedByBudget ?? 0}
            />

            <div>
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                What the agent receives
              </div>
              <VariablePreview
                topicId={topicId}
                bundle={builder.draft}
                title={topic?.name ?? undefined}
                estimatedTokens={builder.preview?.tokens ?? 0}
                disabled={selectionCount === 0}
              />
            </div>

            <AgentRunner
              manifest={manifest}
              bundle={builder.draft}
              disabled={selectionCount === 0}
              suggestedAgentId={suggestedAgentId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Run any agent with the current selection — through the CANONICAL execution
 * system, not a bespoke one-shot call.
 *
 * The first version of this used `useRunAgent` (one-shot text accumulation) and
 * rendered the result with `<MarkdownStream content=…>`. That is the wrong path
 * for a surface a human watches: it concatenates every `chunk` event into one
 * string, so a reasoning model's THINKING tokens land in the visible output as
 * plain prose, tool calls never render as cards, and the result is a dead blob
 * with no actions on it.
 *
 * `launchAgent` is the platform's universal entry point. It creates a real
 * conversation + message, streams through the execution system, and the
 * `flexible-panel` display mode renders it with the same components chat uses:
 * live streaming, collapsible thinking, inline tool cards, the assistant action
 * bar and its options menu (copy, edit, send to notes, save), and the ability
 * to keep talking to the agent about what it produced.
 *
 * The variable contract is still shown BEFORE the run: which of the agent's
 * declared variables this selection fills, and which it leaves empty. An
 * unfilled variable is not an error (the agent may have a default) but it is
 * never hidden — a brand-profile agent silently receiving no page content would
 * produce a confident, sourceless profile.
 */
function AgentRunner({
  manifest,
  bundle,
  disabled,
  suggestedAgentId,
}: {
  manifest: Parameters<typeof resolveBundle>[0];
  bundle: ContextBundle;
  disabled: boolean;
  /** The agent a loaded bundle was authored for. Preselected, never forced. */
  suggestedAgentId: string | null;
}) {
  const dispatch = useAppDispatch();
  const { topicId } = useTopicContext();
  const { launchAgent } = useAgentLauncher();
  const liveAgents = useAppSelector(selectLiveAgents);
  // The bundle's own agent is a DEFAULT, not state to synchronise: derive it.
  // (An effect that setState'd on `suggestedAgentId` was a cascading render,
  // and it could also fight a choice the user had already made.)
  const [pickedAgentId, setPickedAgentId] = useState<string | null>(null);
  const agentId = pickedAgentId ?? suggestedAgentId;
  const setAgentId = setPickedAgentId;
  const [launching, setLaunching] = useState(false);
  /**
   * The run instruction. Variables carry the RESEARCH; this carries the ASK, and
   * the two are not interchangeable — a user who wants "focus on the founders,
   * skip the offerings" has nowhere else to say it.
   */
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);

  const payload = useAppSelector((s: RootState) =>
    agentId ? selectAgentExecutionPayload(s, agentId) : null,
  );

  useEffect(() => {
    if (agentId && payload && !payload.isReady) {
      dispatch(fetchAgentExecutionMinimal(agentId)).catch(() => {
        /* contract stays unknown; the UI says so rather than guessing */
      });
    }
  }, [agentId, payload, dispatch]);

  const selectedAgentName = useMemo(
    () => liveAgents.find((a) => a.id === agentId)?.name ?? null,
    [liveAgents, agentId],
  );
  const declared = payload?.variableDefinitions ?? null;
  const bundleVars = new Set(bundle.bindings.map((b) => b.variable));

  const doRun = async () => {
    if (!agentId) return;
    setLaunching(true);
    try {
      const resolved = await resolveBundle(manifest, bundle);
      if (resolved.report.truncated || resolved.report.exceedsBudget) {
        // Loud, not silent: the user is told what the model did NOT get, and
        // the budget meter above already names which resources lost items.
        toast.warning(
          `Context trimmed before sending — ${resolved.report.notes.join("; ")}`,
        );
      }
      await launchAgent(agentId, {
        surfaceKey: `research-context:${topicId}`,
        sourceFeature: "research",
        config: {
          // The platform's resizable, fullscreen-capable panel — the same one
          // every other agent surface uses. Nothing hand-rolled here.
          displayMode: "flexible-panel",
          autoRun: true,
          allowChat: true,
          showPreExecutionGate: false,
        },
        runtime: {
          variables: resolved.variables,
          // Lazy tier: resource_refs the agent pulls through its context tool
          // only if it wants them — the "context" delivery path.
          ...(Object.keys(resolved.contextRefs).length > 0
            ? { context: resolved.contextRefs }
            : {}),
          userInput: instruction.trim() || DEFAULT_INSTRUCTION,
          surfaceName: RESEARCH_SURFACE_NAME,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The run failed");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Run an agent</span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* The canonical agent picker — search, sort, categories, tags and a
            detail card, with a mobile drawer. A plain <select> is unusable at
            300+ agents, and a second bespoke picker is a second thing to fix. */}
        <AgentListDropdown
          activeAgentId={agentId}
          onSelect={(id) => setAgentId(id)}
          className="flex-1 min-w-0"
          triggerSlot={
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full justify-between gap-1.5 text-xs"
            >
              <span className="truncate">
                {selectedAgentName ?? "Choose an agent…"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </Button>
          }
        />
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs shrink-0"
          disabled={disabled || !agentId || launching}
          onClick={doRun}
        >
          {launching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run
        </Button>
      </div>

      {agentId && (
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Instruction
          </span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            className="w-full rounded border border-border/60 bg-transparent px-2 py-1 text-[11px] text-foreground resize-y"
            placeholder={DEFAULT_INSTRUCTION}
          />
        </label>
      )}

      {agentId && declared && declared.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Its variables
          </div>
          {declared.map((v) => {
            const filled = bundleVars.has(v.name);
            return (
              <div
                key={v.name}
                className="flex items-center gap-1.5 text-[11px]"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    filled ? "bg-emerald-500/70" : "bg-muted-foreground/40",
                  )}
                />
                <code className="text-foreground/85">{v.name}</code>
                <span className="text-muted-foreground">
                  {filled ? "filled by this selection" : "not filled"}
                </span>
              </div>
            );
          })}
          {Array.from(bundleVars)
            .filter((v) => !declared.some((d) => d.name === v))
            .map((v) => (
              <div key={v} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70 shrink-0" />
                <code className="text-foreground/85">{v}</code>
                <span className="text-amber-700 dark:text-amber-400">
                  this agent does not declare it — it will be ignored
                </span>
              </div>
            ))}
        </div>
      )}

      {agentId && declared && declared.length === 0 && (
        <div className="text-[11px] text-muted-foreground">
          This agent declares no variables, so it reads only its own prompt —
          selecting resources here will not reach it. Give it variables in the
          agent builder first.
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Opens in the standard agent panel: live streaming, thinking and tool
        cards, and the usual message actions (copy, send to notes, save).
      </p>
    </div>
  );
}
