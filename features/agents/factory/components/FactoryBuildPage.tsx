"use client";

/**
 * /administration/agents/factory/[buildId] — one Agent Factory build as a
 * vertical run (the GitHub Actions / Vercel deployment-log shape): every step
 * in order, each expandable to its answer rendered through that answer's kind
 * component, its run, its timing; send-backs drawn as loops; the saved agent;
 * then the proof cases side by side (candidate vs today's answer) with the
 * judge's per-criterion verdict, un-blinded.
 *
 * Source: the build's latest checkpoint (`runtime.global_execution_checkpoint`).
 * Polls every 3s until the spine row is over.
 *
 * Known limits of the record (aidream, not this page):
 *  - code steps (model, save, proof) are recorded once per build, so they are
 *    drawn once, before the final judge round;
 *  - a step's gate findings are written after its history copy, so an earlier
 *    attempt's gate findings are not on the record — the loop says "Gates";
 *  - step runs are system runs: their conversation may not be kept, and no
 *    per-step cost is recorded on the spine.
 */

import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  Repeat,
  SkipForward,
  X,
} from "lucide-react";
import { EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  CriterionVerdicts,
  LongText,
  outcomeChip,
  preferenceLabel,
  verdictChip,
} from "@/components/mardown-display/blocks/agent-factory-kinds/AgentFactoryKindBlocks";
import {
  ChipRow,
  StateChip,
  isRecord,
} from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import { getFactoryBuild, keptConversationIds } from "../service";
import {
  STEP_ANSWER_KIND,
  STEP_LABEL,
  STEP_ORDER,
  spineIsOver,
  type FactoryBuildDetail,
  type FactoryBuildState,
  type FactoryProofCase,
  type FactoryStepName,
  type FactoryStepRecord,
} from "../types";
import { SpineStatusChip, formatDuration } from "./factory-shared";
import { FACTORY_BASE_PATH } from "./FactoryBuildsPage";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ErrorNotice } from "@ai-matrx/design-system";
const POLL_MS = 3000;

export type RowStatus = "done" | "running" | "failed" | "skipped" | "pending";

export interface RunRow {
  key: string;
  step: FactoryStepName;
  status: RowStatus;
  attempt?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  /** A judgment step's record (its run, answer, findings). */
  record?: FactoryStepRecord;
  /** Drawn above this row: the build looped back here. */
  loop?: { from: string; findings: string[] };
  /** An earlier judge round's code steps: drawn as one line, details on the last round. */
  label?: string;
}

/* ----------------------------------------------------------- the timeline */

export function buildRows(detail: FactoryBuildDetail): RunRow[] {
  const state = detail.state ?? {};
  const over = spineIsOver(detail.spineStatus);
  const failedHere = detail.spineStatus === "failed" ? state.current_step : null;
  const history = state.history ?? [];
  const rows: RunRow[] = [];

  rows.push({
    key: "intake",
    step: "intake",
    status: state.facts ? "done" : failedHere === "intake" ? "failed" : over ? "failed" : "running",
    startedAt: detail.startedAt ?? detail.createdAt,
    endedAt: history[0]?.started_at ?? (state.facts ? detail.checkpointAt : null),
  });
  // R53: a rebuild runs today's version on every case first — its own step.
  const rebuilds = Boolean(state.rebuild || state.request?.rebuild_of);
  if (state.rebuild) {
    rows.push({
      key: "baseline",
      step: "baseline",
      status: state.rebuild.baselined
        ? "done"
        : state.current_step === "baseline"
          ? failedHere === "baseline" || over ? "failed" : "running"
          : "pending",
    });
  }
  if (state.steps?.contract?.status === "skipped") {
    rows.push({ key: "contract-skipped", step: "contract", status: "skipped" });
  }

  const lastJudge = history.map((h) => h.step).lastIndexOf("proof_review");
  const codeRows = (): RunRow[] => {
    const out: RunRow[] = [];
    const reached = (s: FactoryStepName) =>
      STEP_ORDER.indexOf((state.current_step ?? "intake") as FactoryStepName) >= STEP_ORDER.indexOf(s);
    if (state.model || reached("model"))
      out.push({ key: "model", step: "model", status: state.model ? "done" : rowState("model") });
    if (state.agent_id || reached("save"))
      out.push({ key: "save", step: "save", status: state.agent_id ? "done" : rowState("save") });
    if ((state.proof?.length ?? 0) > 0 || reached("proof"))
      out.push({ key: "proof", step: "proof", status: (state.proof?.length ?? 0) > 0 ? "done" : rowState("proof") });
    return out;
  };
  const rowState = (s: FactoryStepName): RowStatus =>
    state.current_step === s ? (failedHere === s || over ? "failed" : "running") : "pending";

  history.forEach((h, i) => {
    if (i === lastJudge) rows.push(...codeRows());
    else if (h.step === "proof_review")
      rows.push({ key: `code-round-${i}`, step: "proof", status: "done", label: "Model · Save · Proof" });
    const prev = history[i - 1];
    let loop: RunRow["loop"];
    // A judge round after the first is the next round, never a loop into the judge.
    if ((h.attempt ?? 1) > 1 && prev && h.step !== "proof_review") {
      const sendBack = prev.step === "proof_review" && isRecord(prev.answer) && isRecord(prev.answer.send_back)
        ? prev.answer.send_back
        : null;
      loop = sendBack
        ? {
            from: "Judge",
            findings: Array.isArray(sendBack.findings)
              ? sendBack.findings.filter((f): f is string => typeof f === "string")
              : [],
          }
        : { from: "Gates", findings: [] };
    }
    rows.push({
      key: `${h.step}-${h.attempt ?? 1}-${i}`,
      step: h.step,
      status: h.status === "failed" ? "failed" : "done",
      attempt: h.attempt,
      startedAt: h.started_at,
      endedAt: h.ended_at,
      record: h,
      loop,
    });
  });
  if (lastJudge < 0) rows.push(...codeRows());

  // The step in flight right now (its record is not in history until it ends).
  const current = state.current_step as FactoryStepName | undefined;
  const live = current && current in STEP_ANSWER_KIND ? state.steps?.[current as keyof typeof STEP_ANSWER_KIND] : undefined;
  if (live && live.status === "running" && !history.some((h) => h.step === live.step && h.attempt === live.attempt)) {
    rows.push({
      key: `${live.step}-${live.attempt ?? 1}-live`,
      step: live.step,
      status: over ? "failed" : "running",
      attempt: live.attempt,
      startedAt: live.started_at,
      record: live,
      loop: (live.attempt ?? 1) > 1 ? { from: "Send-back", findings: [] } : undefined,
    });
  }

  if (!over) {
    const seen = new Set(rows.map((r) => r.step));
    const at = STEP_ORDER.indexOf((current ?? "intake") as FactoryStepName);
    for (const s of STEP_ORDER.slice(at + 1)) {
      if (s === "baseline" && !rebuilds) continue;
      if (!seen.has(s) && !(s === "contract" && state.facts && !state.facts.greenfield)) {
        rows.push({ key: `${s}-pending`, step: s, status: "pending" });
      }
    }
  }
  return rows;
}

/* ------------------------------------------------------------- the pieces */

export const StatusIcon: React.FC<{ status: RowStatus }> = ({ status }) => {
  const box = "flex size-5 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "done":
      return <span className={cn(box, "bg-success/15 text-success-ink")}><Check className="size-3" /></span>;
    case "failed":
      return <span className={cn(box, "bg-destructive/15 text-destructive-ink")}><X className="size-3" /></span>;
    case "running":
      return <span className={cn(box, "bg-primary/15 text-primary-ink")}><Spinner size="xs" className="text-current" /></span>;
    case "skipped":
      return <span className={cn(box, "bg-muted text-muted-foreground")}><SkipForward className="size-3" /></span>;
    default:
      return <span className={cn(box, "text-muted-foreground/50")}><Circle className="size-3" /></span>;
  }
};

const Meta: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 break-all">{children}</span>
  </>
);

function CodeStepBody({ step, state }: { step: FactoryStepName; state: FactoryBuildState }) {
  if (step === "intake") {
    const facts = state.facts;
    if (!facts) return <span className="type-secondary text-muted-foreground">—</span>;
    const locked = facts.locked ?? {};
    return (
      <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 type-secondary">
        <Meta label="Job">{locked.mandate_key ?? (facts.greenfield ? "New agent" : "—")}</Meta>
        <Meta label="Output kind">{locked.output_kind ?? "—"}</Meta>
        <Meta label="Inputs">{(locked.input_names ?? []).length}</Meta>
        <Meta label="Guaranteed">{(locked.guaranteed_input_names ?? []).join(", ") || "—"}</Meta>
        <Meta label="Typed text">{locked.accepts_user_input ? "Yes" : "No"}</Meta>
        <Meta label="Real inputs">{(facts.real_inputs ?? []).length}</Meta>
        <Meta label="Holder today">
          {facts.holder_agent_id ? (
            <EntityRef token="agent" id={facts.holder_agent_id} name={facts.holder_agent_id} showIcon={false} openInNewTab />
          ) : (
            "—"
          )}
        </Meta>
      </div>
    );
  }
  if (step === "model") {
    const m = state.model;
    return (
      <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 type-secondary">
        <Meta label="Model">{m?.model_name ?? "—"}</Meta>
        <Meta label="Chosen by">{m?.source ?? "—"}</Meta>
        <Meta label="Why">{m?.reason ?? "—"}</Meta>
      </div>
    );
  }
  if (step === "save") {
    return (
      <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 type-secondary">
        <Meta label="Agent">
          {state.agent_id ? (
            <EntityRef token="agent" id={state.agent_id} name={state.agent_id} showIcon={false} openInNewTab />
          ) : (
            "—"
          )}
        </Meta>
        <Meta label="Versions">{(state.version_ids ?? []).length}</Meta>
      </div>
    );
  }
  if (step === "proof") {
    const cases = state.proof ?? [];
    const gates = cases.flatMap((c) => c.gates ?? []);
    return (
      <ChipRow>
        <StateChip label={`${cases.length} cases`} />
        <StateChip
          label={`${gates.filter((g) => g[1]).length}/${gates.length} code gates`}
          tone={gates.every((g) => g[1]) ? "good" : "bad"}
        />
        <a href="#proof-cases" className="type-secondary text-primary hover:underline">
          Cases
        </a>
      </ChipRow>
    );
  }
  return null;
}

function stepSummary(row: RunRow, state: FactoryBuildState): React.ReactNode {
  const a = row.record?.answer;
  if (row.step === "proof_review" && isRecord(a)) return verdictChip(typeof a.verdict === "string" ? a.verdict : null);
  if (row.step === "model" && state.model?.model_name) return <span className="type-secondary text-muted-foreground">{state.model.model_name}</span>;
  if (row.step === "tool_choice" && isRecord(a) && Array.isArray(a.tools))
    return <span className="type-secondary text-muted-foreground">{a.tools.length} tools</span>;
  if (row.label) return null;
  if (row.step === "proof" && state.proof?.length) return <span className="type-secondary text-muted-foreground">{state.proof.length} cases</span>;
  if (row.step === "contract" && row.status === "skipped") return <span className="type-secondary text-muted-foreground">The job is the contract</span>;
  return null;
}

function StepRow({
  row,
  state,
  last,
  kept,
  open,
  onToggle,
}: {
  row: RunRow;
  state: FactoryBuildState;
  last: boolean;
  kept: Set<string>;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = row.status !== "pending" && row.status !== "skipped" && !row.label;
  const rec = row.record;
  const findings = rec?.findings ?? [];
  return (
    <>
      {row.loop ? (
        <li className="relative flex gap-3 pb-2">
          <div className="flex w-5 shrink-0 justify-center">
            <span className="w-px bg-warning/60" />
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-md border border-dashed border-warning/50 bg-warning/5 px-2.5 py-1.5 type-secondary">
            <span className="flex items-center gap-1.5 font-medium text-warning">
              <Repeat className="size-3.5" />
              {row.loop.from} sent it back to {STEP_LABEL[row.step]}
            </span>
            {row.loop.findings.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {row.loop.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ) : null}
      <li className="relative flex gap-3">
        <div className="flex w-5 shrink-0 flex-col items-center">
          <StatusIcon status={row.status} />
          {!last ? <span className="w-px flex-1 bg-border" /> : null}
        </div>
        <div className={cn("flex min-w-0 flex-1 flex-col pb-3", row.status === "pending" && "opacity-50")}>
          <button
            type="button"
            disabled={!expandable}
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 items-center gap-2 rounded-md py-0.5 text-left hover:bg-muted/40 disabled:hover:bg-transparent"
          >
            {expandable ? (
              <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
            ) : (
              <span className="size-3.5 shrink-0" />
            )}
            <span className={cn("type-title", row.label && "font-normal text-muted-foreground")}>
              {row.label ?? STEP_LABEL[row.step]}
            </span>
            {(row.attempt ?? 1) > 1 ? (
              <StateChip
                label={row.step === "proof_review" ? `Round ${row.attempt}` : `Attempt ${row.attempt}`}
                tone={row.step === "proof_review" ? "neutral" : "warn"}
              />
            ) : null}
            {findings.length > 0 ? <StateChip label={`${findings.length} findings`} tone="bad" /> : null}
            {stepSummary(row, state)}
            <span className="ml-auto shrink-0 pl-2 type-secondary tabular-nums text-muted-foreground">
              {row.status === "running" ? "Running" : formatDuration(row.startedAt, row.endedAt) === "—" ? "" : formatDuration(row.startedAt, row.endedAt)}
            </span>
          </button>
          {open && expandable ? (
            <div className="mt-1.5 flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3">
              {rec?.error ? (
                <p className="type-secondary text-destructive">{rec.error}<ErrorAlchemyMenu error={rec.error} /></p>
              ) : null}
              {findings.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5 type-secondary text-destructive">
                  {findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : null}
              {rec ? (
                rec.answer !== undefined && rec.answer !== null ? (
                  <KindInstanceRender kind={STEP_ANSWER_KIND[rec.step]} value={rec.answer} variant="bare" />
                ) : row.status === "running" ? (
                  <RegionSkeleton shape="rows" count={3} aria-label="Step running" />
                ) : null
              ) : (
                <CodeStepBody step={row.step} state={state} />
              )}
              {rec ? (
                <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 type-secondary">
                  <Meta label="Job">
                    {rec.mandate_key ? (
                      <Link
                        href={`/administration/intelligence/mandates/${encodeURIComponent(rec.mandate_key)}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {mandateDisplayName(storedMandateKey(rec.mandate_key))}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Meta>
                  <Meta label="Step agent">
                    {rec.holder_agent_id ? (
                      <EntityRef token="agent" id={rec.holder_agent_id} name={rec.holder_agent_id} showIcon={false} openInNewTab />
                    ) : (
                      "—"
                    )}
                  </Meta>
                  <Meta label="Conversation">
                    {rec.conversation_id ? (
                      kept.has(rec.conversation_id) ? (
                        <EntityRef token="conversation" id={rec.conversation_id} name={rec.conversation_id} showIcon={false} openInNewTab />
                      ) : (
                        <span className="font-mono text-muted-foreground" title="System run — the conversation was not kept">
                          {rec.conversation_id} · not kept
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </Meta>
                  <Meta label="Started">{rec.started_at ? new Date(rec.started_at).toLocaleTimeString() : "—"}</Meta>
                  <Meta label="Cost">
                    <span className="text-muted-foreground" title="Step runs record no cost on the spine">—</span>
                  </Meta>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </li>
    </>
  );
}

/* ------------------------------------------------------------ proof cases */

function ProofCaseCard({
  pc,
  baseline,
  review,
  kept,
}: {
  pc: FactoryProofCase;
  baseline: string | null;
  review: Record<string, unknown> | null;
  kept: Set<string>;
}) {
  const labels = pc.candidate_label === "b" ? { a: "Baseline", b: "Candidate" } : { a: "Candidate", b: "Baseline" };
  const preferred = pc.preferred === "candidate" ? (pc.candidate_label ?? "a") : pc.preferred === "baseline" ? (pc.candidate_label === "b" ? "a" : "b") : pc.preferred ?? null;
  const pref = preferenceLabel(preferred, labels);
  const criteria = review && Array.isArray(review.criteria) ? review.criteria.filter(isRecord) : [];
  const gates = pc.gates ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-md border border-border bg-card p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-mono type-secondary font-medium" title={pc.case_id}>{pc.case_id}</span>
        {pc.source ? <span className="type-secondary text-muted-foreground">{pc.source}</span> : null}
        <span className="type-secondary text-muted-foreground" title="The judge saw the two answers as A and B">
          A = {labels.a} · B = {labels.b}
        </span>
        <span className="ml-auto flex items-center gap-1.5 type-secondary text-muted-foreground">
          Judge prefers <StateChip label={pref.label} tone={pref.tone} icon={pref.icon} />
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {gates.map(([name, ok, detail], i) => (
          <span key={i} title={detail}>
            <StateChip label={name} tone={ok ? "good" : "bad"} icon={ok ? <Check className="size-3" /> : <X className="size-3" />} />
          </span>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2 type-secondary font-medium">
            Candidate
            {pc.candidate_conversation_id && kept.has(pc.candidate_conversation_id) ? (
              <EntityRef token="conversation" id={pc.candidate_conversation_id} name="Run" showIcon={false} openInNewTab />
            ) : null}
          </div>
          <LongText text={pc.candidate_output ?? null} maxHeight="max-h-96" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="type-secondary font-medium">Baseline (today)</div>
          <LongText text={baseline} maxHeight="max-h-96" />
        </div>
      </div>
      {criteria.length > 0 ? <CriterionVerdicts criteria={criteria} labels={labels} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function FactoryBuildPage({ buildId }: { buildId: string }) {
  const [detail, setDetail] = useState<FactoryBuildDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const next = await getFactoryBuild(buildId);
      setDetail(next);
      setError(null);
      const ids = [
        ...(next?.state?.history ?? []).map((h) => h.conversation_id ?? ""),
        ...(next?.state?.proof ?? []).map((p) => p.candidate_conversation_id ?? ""),
      ];
      setKept(await keptConversationIds(ids));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the build");
    }
  }, [buildId]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = detail ? !spineIsOver(detail.spineStatus) : false;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  const rows = useMemo(() => (detail ? buildRows(detail) : []), [detail]);

  if (detail === undefined && !error) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4">
        <RegionSkeleton shape="rows" count={8} aria-label="Loading build" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <ErrorNotice
         
          title={error ? "Could not load this build" : "No build has this id"}
           message={error ?? buildId}
        />
      </div>
    );
  }

  const state = detail.state ?? {};
  const job = state.request?.mandate_key ?? null;
  const reviewCases = (() => {
    const a = state.steps?.proof_review?.answer;
    const out = new Map<string, Record<string, unknown>>();
    if (isRecord(a) && Array.isArray(a.cases)) {
      for (const c of a.cases.filter(isRecord)) {
        const id = typeof c.case_id === "string" ? c.case_id.replace(/^Case /, "").trim() : "";
        if (id) out.set(id, c);
      }
    }
    return out;
  })();
  const baselines = new Map((state.facts?.real_inputs ?? []).map((r) => [r.case_id, r.baseline_output ?? null]));
  const toggle = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto" data-matrx-page-scroll>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <header className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={FACTORY_BASE_PATH} className="flex items-center gap-1 type-secondary text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Agent Factory
            </Link>
            <span className="type-secondary text-muted-foreground">/</span>
            <h1 className="truncate font-mono text-base font-semibold">{job ?? "New agent"}</h1>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SpineStatusChip status={detail.spineStatus} />
            {outcomeChip(state.outcome ?? null)}
            <StateChip
              label={`${state.send_backs ?? 0} send-back${state.send_backs === 1 ? "" : "s"}`}
              tone={(state.send_backs ?? 0) > 0 ? "warn" : "neutral"}
              icon={<Repeat className="size-3" />}
            />
            <span className="type-secondary text-muted-foreground" title={new Date(detail.createdAt).toLocaleString()}>
              {formatDistanceToNow(new Date(detail.createdAt), { addSuffix: true })}
            </span>
            {detail.endedAt ? (
              <span className="type-secondary tabular-nums text-muted-foreground">
                {formatDuration(detail.startedAt ?? detail.createdAt, detail.endedAt)}
              </span>
            ) : null}
            {state.agent_id ? (
              <span className="ml-auto flex items-center gap-1.5 type-secondary">
                <span className="text-muted-foreground">Agent</span>
                <EntityRef token="agent" id={state.agent_id} name={state.agent_id.slice(0, 8)} />
              </span>
            ) : null}
          </div>
          {state.error ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/5 p-2.5 font-mono type-secondary text-destructive-ink">
              {state.error}
            <ErrorAlchemyMenu error={state.error} /></pre>
          ) : null}
        </header>

        <ol className="flex flex-col">
          {rows.map((row, i) => (
            <StepRow
              key={row.key}
              row={row}
              state={state}
              last={i === rows.length - 1}
              kept={kept}
              open={openRows.has(row.key)}
              onToggle={() => toggle(row.key)}
            />
          ))}
        </ol>

        {(state.proof?.length ?? 0) > 0 ? (
          <section id="proof-cases" className="flex flex-col gap-2">
            <h2 className="type-title">Proof</h2>
            {(state.proof ?? []).map((pc) => (
              <ProofCaseCard
                key={pc.case_id}
                pc={pc}
                baseline={baselines.get(pc.case_id) ?? null}
                review={reviewCases.get(pc.case_id) ?? null}
                kept={kept}
              />
            ))}
          </section>
        ) : null}

        {(state.flags?.length ?? 0) + (state.assumptions?.length ?? 0) > 0 ? (
          <section className="flex flex-col gap-2">
            {(state.flags?.length ?? 0) > 0 ? (
              <details className="rounded-md border border-border">
                <summary className="px-2.5 py-1.5 type-secondary font-medium">Flags ({state.flags?.length})</summary>
                <ul className="list-disc space-y-1 border-t border-border p-2.5 pl-7 type-secondary">
                  {(state.flags ?? []).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {(state.assumptions?.length ?? 0) > 0 ? (
              <details className="rounded-md border border-border">
                <summary className="px-2.5 py-1.5 type-secondary font-medium">Assumptions ({state.assumptions?.length})</summary>
                <ul className="list-disc space-y-1 border-t border-border p-2.5 pl-7 type-secondary">
                  {(state.assumptions ?? []).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
