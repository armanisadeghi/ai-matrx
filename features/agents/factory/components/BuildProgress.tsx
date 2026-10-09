"use client";

/**
 * BuildProgress — the ONE progress primitive every agent-creating door mounts
 * while an Agent Factory build runs (PLAN-CUTOVER P2 + P6, rulings R34/R35).
 *
 * Compact form of the admin `FactoryBuildPage`: the same timeline rows
 * (`buildRows`, `StatusIcon`) folded to one row per step, live while the build
 * runs (polls the build's latest checkpoint every 3s, read straight from the
 * spine under the person's own RLS — they started it), then the honest outcome:
 *  - passed → open the agent;
 *  - saved unproven → the badge; its first 3 real runs are judged;
 *  - refused with a saved draft (archived, R15) → today's agent stays, the
 *    reasons, and "Keep it anyway" (un-archives, marked unproven — O4);
 *  - too few examples → "Build unproven" (R34, a person's choice; the server
 *    refuses it on headless doors);
 *  - needs a new shape / a workflow / an error → said plainly.
 * Admins get a link to the full build page (the way into the admin section).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Repeat } from "lucide-react";
import { Badge, Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ErrorNotice } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";
import { outcomeChip } from "@/components/mardown-display/blocks/agent-factory-kinds/AgentFactoryKindBlocks";
import { StateChip, isRecord } from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import { getFactoryBuild, keepBuildAnyway, startAgentBuild } from "../service";
import {
  KEPT_OUTCOMES,
  STEP_LABEL,
  spineIsOver,
  type FactoryBuildDetail,
  type FactoryBuildState,
  type FactoryStepName,
  type SpineStatus,
} from "../types";
import { buildRows, StatusIcon, type RowStatus } from "./FactoryBuildPage";
import { formatDuration } from "./factory-shared";
import { refineAgentHref } from "../refine-link";
import { catalogProseText } from "@/features/content-ir/surfaces/kind-one-line";

const POLL_MS = 3000;
/** A proof case's result, from the new agent's side. */
const CASE_WORD: Record<string, string> = { candidate: "won", baseline: "lost", tie: "tie", both_fail: "both failed" };
const ADMIN_BUILD_PATH = "/administration/agents/factory";

export interface BuildProgressProps {
  buildId: string;
  /** Called once when the build ends (any outcome) — doors use it to pick up the agent id. */
  onFinished?: (state: FactoryBuildState) => void;
  /** Called when the person starts a follow-up build (Build unproven) — the door tracks the new id. */
  onRebuilt?: (buildId: string) => void;
  /** Called with the agent "Keep it anyway" kept — a door that places the agent (a mandate's holder) uses it. */
  onKept?: (agentId: string) => void;
  /**
   * R58: the moment a build keeps a NEW agent (passed or saved), go to it in the builder
   * with the Side Chat open beside it (`refineAgentHref`). Doors that place the agent
   * somewhere themselves (a mandate's holder controls) leave this off.
   */
  forwardWhenKept?: boolean;
  className?: string;
}

interface StepCell {
  step: FactoryStepName;
  status: RowStatus;
  attempts: number;
}

/** One cell per step, latest status wins; attempts count the send-back loops. */
function stepCells(detail: FactoryBuildDetail): StepCell[] {
  const cells = new Map<FactoryStepName, StepCell>();
  for (const row of buildRows(detail)) {
    if (row.label) continue;
    const prev = cells.get(row.step);
    cells.set(row.step, {
      step: row.step,
      status: row.status,
      attempts: Math.max(prev?.attempts ?? 0, row.attempt ?? 1),
    });
  }
  return [...cells.values()];
}

function decisionReason(state: FactoryBuildState): string | null {
  const decision = (state as Record<string, unknown>).pass_decision;
  if (isRecord(decision) && typeof decision.reason === "string") return decision.reason;
  return null;
}

function OutcomePanel({
  state,
  spineStatus,
  busy,
  onKeep,
  onBuildUnproven,
}: {
  state: FactoryBuildState;
  /** The execution's real status — the checkpoint can still say running after a worker died. */
  spineStatus: SpineStatus;
  busy: boolean;
  onKeep: () => void;
  onBuildUnproven: () => void;
}) {
  // A build whose worker died before the reaper settled it: the spine says failed or
  // cancelled while the checkpoint never got an outcome — show it stopped, never blank.
  const outcome =
    state.outcome ?? (spineStatus === "failed" || spineStatus === "cancelled" ? "worker_lost" : null);
  const greenfield = state.facts?.greenfield ?? !state.request?.mandate_key;
  const agentId = state.agent_id ?? null;
  const kept = Boolean(outcome && KEPT_OUTCOMES.has(outcome));
  const reason = decisionReason(state);

  const openAgent = agentId ? (
    <Button asChild variant="primary">
      <Link href={refineAgentHref(agentId)}>Open agent</Link>
    </Button>
  ) : null;

  let line: string | null = null;
  let actions: React.ReactNode = null;
  if (outcome === "passed") {
    line = "Ready. It passed its proof.";
    actions = openAgent;
  } else if (outcome === "saved_unproven") {
    line = "Saved. Its first 3 runs prove it.";
    actions = openAgent;
  } else if ((outcome === "send_backs_exhausted" || outcome === "judge_not_blind") && agentId) {
    line = greenfield
      ? "The draft did not pass your examples."
      : "Today's agent stays. The new draft did not beat it.";
    actions = (
      <Button variant="outline" onClick={onKeep} disabled={busy}>
        Keep it anyway
      </Button>
    );
  } else if (outcome === "unproven") {
    line = "Not kept. Too few real cases to prove it.";
    actions = agentId ? (
      <Button variant="outline" onClick={onKeep} disabled={busy}>
        Keep it anyway
      </Button>
    ) : (
      <Button variant="outline" onClick={onBuildUnproven} disabled={busy}>
        Build unproven
      </Button>
    );
  } else if (outcome === "no_proof_inputs") {
    line = "The proof needs 3 example inputs.";
    actions = (
      <Button variant="outline" onClick={onBuildUnproven} disabled={busy}>
        Build unproven
      </Button>
    );
  } else if (outcome === "needs_new_kind") {
    line = "This job needs a new output shape first.";
  } else if (outcome === "workflow_sized") {
    line = "This job needs a workflow, not one agent.";
  } else if (outcome === "worker_lost") {
    line = "Stopped mid-build. Start it again to resume.";
  } else if (outcome) {
    line = "The build stopped.";
  }

  const cases = (state.proof ?? []).filter((c) => c.preferred);
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {outcomeChip(outcome)}
        {kept && outcome === "saved_unproven" ? <Badge tone="warning">Unproven</Badge> : null}
        {line ? <span className="min-w-0 type-body">{line}</span> : null}
        <span className="ml-auto flex items-center gap-2">{actions}</span>
      </div>
      {cases.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {cases.map((c, i) => (
            <StateChip
              key={c.case_id}
              label={`Case ${i + 1} · ${CASE_WORD[c.preferred ?? ""] ?? c.preferred}`}
              tone={c.preferred === "candidate" ? "good" : c.preferred === "baseline" || c.preferred === "both_fail" ? "bad" : "neutral"}
            />
          ))}
        </div>
      ) : null}
      {!kept && (reason || state.error) ? (
        <details className="rounded-md border border-border">
          <summary className="px-2.5 py-1.5 type-secondary font-medium">Why</summary>
          <p className="whitespace-pre-wrap break-words border-t border-border p-2.5 type-secondary text-muted-foreground">
            {/* A kind carried in the reason reads as its one-line label (L-5, round 9). */}
            {catalogProseText(reason ?? state.error)}
          </p>
        </details>
      ) : null}
    </div>
  );
}

export function BuildProgress({ buildId, onFinished, onRebuilt, onKept, forwardWhenKept, className }: BuildProgressProps) {
  const router = useRouter();
  // A "Build unproven" follow-up replaces the build this view tracks.
  const [rebuiltId, setRebuiltId] = useState<string | null>(null);
  const currentId = rebuiltId ?? buildId;
  // The latest read, tagged with the build it belongs to (a new id reads as loading).
  const [snap, setSnap] = useState<{ id: string; detail: FactoryBuildDetail | null; error: string | null } | null>(null);
  const detail = snap?.id === currentId ? snap.detail : undefined;
  const error = snap?.id === currentId ? snap.error : null;
  const [busy, setBusy] = useState(false);
  const [keptAgent, setKeptAgent] = useState<string | null>(null);
  const isAdmin = useAppSelector(selectIsAdminPerson);

  // One effect per build id: load now, poll every 3s, stop once the spine row is over.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const next = await getFactoryBuild(currentId);
        if (!live) return;
        setSnap({ id: currentId, detail: next, error: null });
        if ((!next || spineIsOver(next.spineStatus)) && timer) clearInterval(timer);
      } catch (e) {
        if (live) setSnap({ id: currentId, detail: null, error: e instanceof Error ? e.message : "Could not load the build" });
      }
    };
    timer = setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [currentId]);

  const over = detail ? spineIsOver(detail.spineStatus) : false;

  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (over && detail?.state && reported.current !== currentId) {
      reported.current = currentId;
      onFinished?.(detail.state);
      const kept = detail.state.outcome && KEPT_OUTCOMES.has(detail.state.outcome) ? detail.state.agent_id : null;
      if (forwardWhenKept && kept) router.push(refineAgentHref(kept));
    }
  }, [over, detail, currentId, onFinished, forwardWhenKept, router]);

  const cells = detail ? stepCells(detail) : [];

  const keep = async () => {
    setBusy(true);
    try {
      const agentId = await keepBuildAnyway(currentId);
      setKeptAgent(agentId);
      onKept?.(agentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not keep the draft");
    } finally {
      setBusy(false);
    }
  };

  const buildUnproven = async () => {
    const req = detail?.state?.request;
    if (!req?.spec) return;
    setBusy(true);
    try {
      // The follow-up keeps the door that started this build, and a builtin stays a builtin
      // (an ownerless spec; the server honors it for admins only).
      const next = await startAgentBuild({
        spec: req.spec,
        mandateKey: req.mandate_key ?? null,
        unproven: true,
        door: req.door ?? null,
        builtin: req.spec.owner === null,
      });
      setRebuiltId(next);
      onRebuilt?.(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the build");
    } finally {
      setBusy(false);
    }
  };

  if (detail === undefined && !error) {
    return <RegionSkeleton shape="rows" count={3} aria-label="Loading build" className={className} />;
  }
  if (error || !detail) {
    return error ? (
      <ErrorNotice title="Build not loaded" message={error} operation="load the agent build" size="compact" className={className} />
    ) : (
      <div className={cn("rounded-md border border-border p-3 type-body text-muted-foreground", className)}>No build has this id.</div>
    );
  }

  const state = detail.state ?? {};
  const name = (state.request?.spec?.display_name as string | undefined) ?? (state.request?.spec?.name as string | undefined) ?? "New agent";
  const sendBacks = state.send_backs ?? 0;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5 rounded-md border border-border bg-card p-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate type-title">{name}</span>
        {!over ? <StateChip label="Building" tone="accent" /> : null}
        {sendBacks > 0 ? (
          <StateChip label={`${sendBacks} send-back${sendBacks === 1 ? "" : "s"}`} tone="warn" icon={<Repeat className="size-3" />} />
        ) : null}
        <span className="ml-auto shrink-0 type-secondary tabular-nums text-muted-foreground">
          {formatDuration(detail.startedAt ?? detail.createdAt, detail.endedAt ?? new Date().toISOString())}
        </span>
        {isAdmin ? (
          <Link
            href={`${ADMIN_BUILD_PATH}/${currentId}`}
            className="flex shrink-0 items-center gap-1 type-secondary text-primary hover:underline"
          >
            Full build
            <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>

      <ol className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        {cells.map((c) => (
          <li
            key={c.step}
            className={cn("flex items-center gap-1.5 type-secondary", c.status === "pending" && "opacity-50")}
            aria-current={c.status === "running" ? "step" : undefined}
          >
            <StatusIcon status={c.status} />
            <span className={cn(c.status === "running" && "font-medium")}>{STEP_LABEL[c.step]}</span>
            {c.attempts > 1 ? <span className="tabular-nums text-muted-foreground">×{c.attempts}</span> : null}
          </li>
        ))}
      </ol>

      {over ? (
        keptAgent ? (
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <Badge tone="warning">Unproven</Badge>
            <span className="type-body">Kept. Its first 3 runs are judged.</span>
            <Button asChild variant="primary" className="ml-auto">
              <Link href={`/agents/${keptAgent}/build`}>Open agent</Link>
            </Button>
          </div>
        ) : (
          <OutcomePanel state={state} spineStatus={detail.spineStatus} busy={busy} onKeep={() => void keep()} onBuildUnproven={() => void buildUnproven()} />
        )
      ) : null}
    </div>
  );
}
