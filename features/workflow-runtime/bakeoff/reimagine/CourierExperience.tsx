"use client";

/**
 * CourierExperience — the Courier concept (ui-reimagine bake-off entry).
 *
 * THE PARADIGM (modeled after Flighty's live flight page × the Domino's
 * tracker): running a workflow is presented as ONE DELIVERY. The page never
 * changes shape across the whole lifecycle:
 *
 *   ┌─ Marquee ──────────── the sentence, the clock, THE PROMISE STRIP ─┐
 *   ├─ Route ──┬─ The Window ───────────────────────────────────────────┤
 *   │ (every   │  Act I: the order form → Act II: the camera follows    │
 *   │  step,   │  the work, internals streaming → Act III: the handoff  │
 *   │  frame 0)├─ Wire ticker ── the real work, line by line ───────────┤
 *   └──────────┴────────────────────────────────────────────────────────┘
 *
 * All data plumbing is the canonical workflow-runtime layer (adoption,
 * slice, selectors, lanes, kind rendering); only the presentation is new.
 * A refresh mid-run lands right back here via `?run=` — the adapter replays.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleSlash } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { CardLoading } from "@/components/matrx/LoadingComponents";

import { useWorkflowRun } from "@/features/workflow-runtime/hooks/useWorkflowRun";
import { useWorkflowRunControls } from "@/features/workflow-runtime/hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunInterrupt,
  selectRunStartedAt,
  selectRunStatus,
  selectRunStatusTs,
} from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import {
  describeWorkflowSteps,
  stepsByNodeId,
} from "@/features/workflow-runtime/components/run/node-presentation";
import {
  deriveRunForm,
  seedRunFormValues,
} from "@/features/workflow-runtime/surface/run-form";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
} from "@/features/workflow-runtime/surface/service";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";

import { doneCount, marqueeSentence, pickFollowedNode } from "./camera";
import { JourneyLine, JourneyStrip } from "./JourneyLine";
import { Marquee } from "./Marquee";
import { OrderWindow, WatchWindow } from "./TheWindow";
import { WireTicker } from "./WireTicker";

type DefinitionState =
  | { phase: "loading" }
  | { phase: "ready"; name: string; definition: WorkflowDefinitionLike }
  | { phase: "missing" }
  | { phase: "error"; error: unknown };

export function CourierExperience({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  // ── The definition — the whole journey is known before frame one ────────
  // State is keyed to the fetch it belongs to and reset DURING RENDER when
  // the key changes (the React-sanctioned adjust-state-on-prop-change form —
  // never a synchronous setState inside the effect body).
  const [formValues, setFormValues] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const defKey = `${definitionId}:${reloadNonce}`;
  const [defSlot, setDefSlot] = useState<{ key: string; state: DefinitionState }>(
    { key: defKey, state: { phase: "loading" } },
  );
  if (defSlot.key !== defKey) {
    setDefSlot({ key: defKey, state: { phase: "loading" } });
  }
  const def = defSlot.key === defKey ? defSlot.state : { phase: "loading" as const };

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowDefinition(definitionId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setDefSlot({ key: defKey, state: { phase: "missing" } });
          return;
        }
        setDefSlot({
          key: defKey,
          state: { phase: "ready", name: row.name, definition: row.definition },
        });
        setFormValues(seedRunFormValues(deriveRunForm(row.definition)));
      })
      .catch((error: unknown) => {
        if (!cancelled) setDefSlot({ key: defKey, state: { phase: "error", error } });
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, defKey]);

  // ── The run — canonical adoption; a refresh replays, never re-streams ───
  const { ensureLane } = useWorkflowRun(runId);
  const controls = useWorkflowRunControls();
  const runKey = runId ?? "";
  const status = useAppSelector(selectRunStatus(runKey));
  const phases = useAppSelector(selectNodeAggregatePhases(runKey));
  const interrupt = useAppSelector(selectRunInterrupt(runKey));
  const startedAt = useAppSelector(selectRunStartedAt(runKey));
  const statusTs = useAppSelector(selectRunStatusTs(runKey));
  const costUsd = useAppSelector(selectRunCostTotal(runKey));

  // ── The camera ──────────────────────────────────────────────────────────
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // A run that cannot be reached (removed, or not ours) must say so, not
  // shimmer forever — and the adapter initialises status to "pending", so
  // silence is indistinguishable from a queued run. So PROBE the truth
  // directly: the canonical run→definition read answers "missing / no
  // access" exactly. A transient probe failure stays "unknown" (never
  // asserted as anything) and the calm state persists.
  const [probeSlot, setProbeSlot] = useState<{
    runId: string | null;
    verdict: "unknown" | "ok" | "unreachable";
  }>({ runId, verdict: "unknown" });
  if (probeSlot.runId !== runId) {
    setProbeSlot({ runId, verdict: "unknown" });
  }
  const runProbe = probeSlot.runId === runId ? probeSlot.verdict : "unknown";
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    fetchRunDefinitionId(runId)
      .then((defId) => {
        if (!cancelled) {
          setProbeSlot({ runId, verdict: defId ? "ok" : "unreachable" });
        }
      })
      .catch(() => {
        // Transient read failure — leave it unknown; the adapter keeps trying.
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (def.phase === "loading") {
    return (
      <Frame title="Workflow">
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
          <CardLoading />
        </div>
      </Frame>
    );
  }
  if (def.phase === "missing" || def.phase === "error") {
    return (
      <Frame title="Workflow">
        <div className="mx-auto w-full max-w-xl px-4 py-8">
          <AccessGate
            token="workflow"
            id={definitionId}
            error={def.phase === "error" ? def.error : undefined}
            onRetry={() => setReloadNonce((n) => n + 1)}
            fallbackHref="/workflows/all"
            fallbackLabel="All workflows"
          />
        </div>
      </Frame>
    );
  }

  const steps = describeWorkflowSteps(def.definition);
  const stepsById = stepsByNodeId(steps);
  const stepLabels: Record<string, string> = {};
  for (const step of steps) stepLabels[step.nodeId] = step.label;
  // The promise: every step that hands the person something — a declared
  // output_kind, or a "show on screen" deliver step that declares none. A
  // workflow that declares neither still ends somewhere: its final step's
  // result is what the person came for, so that is what gets promised.
  const declared = steps.filter(
    (step) => step.outputKind !== null || step.family === "deliver",
  );
  const deliverables = declared.length > 0 ? declared : steps.slice(-1);

  const followedNodeId = runId
    ? pickFollowedNode(steps, phases, pinnedNodeId, interrupt?.nodeId ?? null)
    : (pinnedNodeId ?? null);
  const followedStep = followedNodeId ? (stepsById[followedNodeId] ?? null) : null;

  const done = doneCount(steps, phases);
  const sentence = !runId
    ? "Ready when you are — press start and watch it happen"
    : runProbe === "unreachable"
      ? "That run isn't here any more"
      : marqueeSentence(status, done, steps.length);

  const pickNode = (nodeId: string) => setPinnedNodeId(nodeId);
  const followLive = () => setPinnedNodeId(null);

  const start = () => {
    void controls
      .startRun({ definitionId, nodeInputs: formValues })
      .then((newRunId) => {
        if (!newRunId) return; // already toasted by the controls hook
        setPinnedNodeId(null);
        router.replace(`${pathname}?run=${newRunId}`, { scroll: false });
      });
  };
  const runAgain = () => {
    setPinnedNodeId(null);
    router.replace(pathname, { scroll: false });
  };

  const sections = deriveRunForm(def.definition);
  const showDeadRunNotice = Boolean(runId) && runProbe === "unreachable";

  return (
    <Frame title={def.name}>
      <Marquee
        sentence={sentence}
        status={runId && !showDeadRunNotice ? status : null}
        startedAt={runId ? startedAt : null}
        endedAt={statusTs}
        costUsd={runId ? costUsd : 0}
        deliverables={deliverables}
        phases={phases}
        onPickDeliverable={pickNode}
        onPause={() => runId && void controls.pause(runId)}
        onResume={() => runId && void controls.resumePaused(runId)}
        onStop={() => runId && void controls.cancel(runId, "graceful")}
        onRunAgain={runAgain}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="hidden w-[290px] shrink-0 overflow-y-auto border-r border-border bg-card/30 scrollbar-thin lg:block">
          <JourneyLine
            steps={steps}
            phases={phases}
            followedNodeId={followedNodeId}
            onPick={pickNode}
            expandedFolds={expandedFolds}
            onToggleFold={(key) =>
              setExpandedFolds((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          />
        </aside>
        <div className="shrink-0 lg:hidden">
          <JourneyStrip
            steps={steps}
            phases={phases}
            followedNodeId={followedNodeId}
            onPick={pickNode}
          />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!runId ? (
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <OrderWindow
                sections={sections}
                values={formValues}
                onFieldChange={(nodeId, key, value) =>
                  setFormValues((prev) => ({
                    ...prev,
                    [nodeId]: { ...prev[nodeId], [key]: value },
                  }))
                }
                starting={controls.starting}
                onStart={start}
                stepCount={steps.length}
              />
            </div>
          ) : showDeadRunNotice ? (
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="mx-auto mt-8 w-full max-w-md rounded-xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CircleSlash className="h-4 w-4 text-muted-foreground" />
                  We can't reach that run
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  It may have been removed, or it may not be yours to see. You
                  can start a fresh one right here.
                </p>
                <button
                  type="button"
                  onClick={runAgain}
                  className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Start fresh
                </button>
              </div>
            </div>
          ) : (
            <WatchWindow
              runId={runId}
              followedStep={followedStep}
              pinned={pinnedNodeId !== null}
              onFollowLive={followLive}
              deliverables={deliverables}
              ensureLane={ensureLane}
              stepLabels={stepLabels}
            />
          )}
          {runId && !showDeadRunNotice ? (
            <WireTicker runId={runId} stepLabels={stepLabels} />
          ) : null}
        </main>
      </div>
    </Frame>
  );
}

/** The constant shell: shared header row + the fixed page skeleton. */
function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              variant="transparent"
              ariaLabel="Back"
              onClick={() => router.back()}
            />
            <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
              {title}
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden">
        <div
          className="flex h-full flex-col"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
