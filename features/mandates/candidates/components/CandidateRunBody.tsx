"use client";

/**
 * The pair record's body (Detail type `mandate_candidate_run`, PLAN §2.6).
 *
 * Reading order is the decision order: what the review concluded → did both
 * runs get the same input → the two answers side by side → what each run did
 * with tools → the two chats. Everything here is recorded data; nothing is
 * derived that the server did not record (P8 / P10 / P13 / P15 / P19).
 */

import { useEffect, useState } from "react";
import { Columns2, Loader2, MessagesSquare, ThumbsDown, ThumbsUp } from "lucide-react";

import { OutputPreview } from "@/features/mandates/admin/bench-output-preview";
import { Button } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { BackendApiError } from "@/lib/api/errors";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useOpenReviewWalkWindow } from "@/features/overlays/openers/reviewWalkWindow";

import {
  recordCandidateAgreement,
  type LiveCandidate,
  type LiveCandidateRun,
  type LiveCandidateRunPayload,
} from "../api";
import { useOpenCandidateSummary } from "../openers";
import { findTranscriptUnit, useTranscriptUnit } from "../transcripts";
import {
  DISPOSITION_WORD,
  RUN_STATUS_WORD,
  STOP_MATCH_WORD,
  VERDICT_TONE,
  VERDICT_WORD,
  attemptWord,
  inputPartWord,
  pairWalkLabel,
  sharedInputsLine,
} from "../words";
import { Chip, JsonBlock, MetricsLine, NewTabLink, StateLine, detailPageHref } from "./parts";

export interface CandidateRunRow extends Record<string, unknown> {
  run: LiveCandidateRun;
  candidate: LiveCandidate | null;
}

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The answer as recorded: `{text, artifact}` (outcome.py `output_record`). */
function answerText(output: unknown): string | null {
  const record = obj(output);
  if (!record) return str(output);
  const text = str(record.text);
  if (text) return text;
  if (record.artifact !== null && record.artifact !== undefined) {
    try {
      return JSON.stringify(record.artifact, null, 2);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * An answer recorded as JSON text is handed to the canonical answer view as the
 * STRUCTURE it is, so a `__kind` renders through its own component (or the
 * structured floor), never as a dump and never as a markdown code fence — the
 * fence path turned an unregistered kind into a warning card squeezed into the
 * half-width column (seen on the clone 2026-09-30).
 */
function parsedStructure(text: string): Record<string, unknown> | unknown[] | null {
  const trimmed = text.trim();
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return null;
  }
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Tool arguments as the structure they are (V1 D15): the live call's arguments
 * are recorded as canonical JSON TEXT, which rendered as one escaped string.
 * A string that parses as a JSON object or array is shown as that value.
 */
export function structuredArgs(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return parsedStructure(value) ?? value;
}

function errorMessage(error: unknown): string | null {
  const record = obj(error);
  if (!record) return str(error);
  return str(record.message) ?? str(record.code);
}

/** The door's own input (P2): `variables` + `user_input`, top-level or under `request`. */
function sharedInput(doorArgs: unknown): { userInput: string | null; variables: Json | null } {
  const args = obj(doorArgs);
  if (!args) return { userInput: null, variables: null };
  const request = obj(args.request);
  return {
    userInput: str(args.user_input) ?? str(request?.user_input),
    variables: obj(args.variables) ?? obj(request?.variables),
  };
}

export function CandidateRunBody({ row }: { row: CandidateRunRow }) {
  const [run, setRun] = useState(row.run);
  // A heartbeat re-read (CandidateRecordBody) hands a newer pair: take it.
  const [seen, setSeen] = useState(row.run);
  if (seen !== row.run) {
    setSeen(row.run);
    setRun(row.run);
  }
  const candidate = row.candidate;
  const payload = run.payload ?? null;

  return (
    <div className="space-y-5" data-candidate-run-body>
      <Toolbar run={run} candidate={candidate} payload={payload} />
      <ReviewBlock run={run} candidate={candidate} payload={payload} onRun={setRun} />
      {payload ? null : (
        <StateLine>
          {run.payload_withheld_reason?.trim() ||
            "The details belong to a conversation you can't open."}
        </StateLine>
      )}
      <InputBlock run={run} payload={payload} />
      <AnswersBlock run={run} candidate={candidate} payload={payload} />
      <ToolsBlock run={run} payload={payload} />
    </div>
  );
}

function Toolbar({
  run,
  candidate,
  payload,
}: {
  run: LiveCandidateRun;
  candidate: LiveCandidate | null;
  payload: LiveCandidateRunPayload | null;
}) {
  const openDiff = useOpenDiffViewerWindow();
  const openSummary = useOpenCandidateSummary();
  const live = answerText(payload?.live_output);
  const cand = answerText(payload?.candidate_output);
  return (
    <div className="flex flex-wrap items-center gap-1" data-candidate-run-toolbar>
      {live !== null && cand !== null ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() =>
            openDiff({
              original: live,
              modified: cand,
              originalLabel: "Live",
              modifiedLabel: "Candidate",
              title: `Pair ${run.number} — live vs candidate`,
              instanceId: `mandate-candidate-diff-${run.id}`,
            })
          }
        >
          <Columns2 className="h-3.5 w-3.5" />
          Compare text
        </Button>
      ) : null}
      {candidate ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => openSummary(candidate.id)}
        >
          All {candidate.counts.runs_wanted} runs
        </Button>
      ) : null}
      <NewTabLink href={detailPageHref("mandate_candidate_run", run.id)} />
    </div>
  );
}

function ReviewBlock({
  run,
  candidate,
  payload,
  onRun,
}: {
  run: LiveCandidateRun;
  candidate: LiveCandidate | null;
  payload: LiveCandidateRunPayload | null;
  onRun: (run: LiveCandidateRun) => void;
}) {
  const judge = obj(payload?.judge);
  const reasoning = str(judge?.reasoning);
  const stopped = obj(payload?.stopped_at);
  const candidateError = errorMessage(payload?.candidate_error);

  let headline: string;
  if (run.status === "completed" && run.verdict) headline = VERDICT_WORD[run.verdict];
  else if (run.status === "stopped") {
    const step = stopped?.step;
    const tool = str(stopped?.tool) ?? "a tool";
    headline = typeof step === "number" ? `Stopped at step ${step}: ${tool}` : `Stopped at ${tool}`;
  } else headline = RUN_STATUS_WORD[run.status];

  return (
    <section className="space-y-2" data-candidate-review>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-1 type-title",
            run.verdict && run.status === "completed"
              ? VERDICT_TONE[run.verdict]
              : run.status === "failed" || run.status === "timed_out"
                ? "bg-red-500/15 text-red-700 dark:text-red-400"
                : run.status === "stopped"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-muted text-foreground",
          )}
          data-candidate-verdict
        >
          {headline}
        </span>
        {candidate ? (
          <span className="type-secondary text-muted-foreground">
            Run {run.number} of {candidate.counts.runs_wanted}
          </span>
        ) : null}
        {run.stop_match ? <Chip>{STOP_MATCH_WORD[run.stop_match]}</Chip> : null}
        {attemptWord(run.attempts) ? (
          <Chip className="bg-sky-500/15 text-sky-700 dark:text-sky-400">
            <span title="Interrupted, then run again." data-candidate-attempt>{attemptWord(run.attempts)}</span>
          </Chip>
        ) : null}
      </div>
      {reasoning ? <p className="type-body leading-relaxed">{reasoning}</p> : null}
      {run.status === "failed" || run.status === "timed_out" ? (
        <ErrorNotice
          size="compact"
          title={run.status === "timed_out" ? "Candidate timed out" : "Candidate failed"}
          message={candidateError ?? run.candidate_error_code ?? "The candidate run failed without a reason."}
          error={payload?.candidate_error ?? run.candidate_error_code}
          code={run.candidate_error_code ?? undefined}
          operation="Run the mandate candidate"
          records={[{ type: "mandate_candidate_run", id: run.id }]}
        />
      ) : null}
      {run.judge_error_code ? (
        <ErrorNotice
          size="compact"
          title="Review didn't run"
          message="The answers were recorded, but the AI review could not compare them."
          code={run.judge_error_code}
          operation="Review the candidate run"
          records={[{ type: "mandate_candidate_run", id: run.id }]}
        />
      ) : null}
      {run.status === "completed" && run.verdict && candidate?.can_decide ? (
        <Agreement run={run} onRun={onRun} />
      ) : null}
    </section>
  );
}

function Agreement({ run, onRun }: { run: LiveCandidateRun; onRun: (run: LiveCandidateRun) => void }) {
  const [busy, setBusy] = useState<"agree" | "disagree" | null>(null);
  const choose = async (agreement: "agree" | "disagree") => {
    setBusy(agreement);
    try {
      onRun(await recordCandidateAgreement(run.id, agreement));
    } catch (error) {
      toast.error(error instanceof BackendApiError ? error.userMessage : String(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex items-center gap-1.5" data-candidate-agreement>
      <span className="mr-1 type-secondary text-muted-foreground">This review</span>
      {(["agree", "disagree"] as const).map((choice) => {
        const Icon = choice === "agree" ? ThumbsUp : ThumbsDown;
        const chosen = run.human_agreement === choice;
        return (
          <Button
            key={choice}
            size="sm"
            variant={chosen ? "default" : "outline"}
            className="h-7 gap-1 text-xs"
            aria-pressed={chosen}
            disabled={busy !== null}
            onClick={() => void choose(choice)}
          >
            <Icon className="h-3.5 w-3.5" />
            {choice === "agree" ? "Agree" : "Disagree"}
          </Button>
        );
      })}
    </div>
  );
}

function InputBlock({
  run,
  payload,
}: {
  run: LiveCandidateRun;
  payload: LiveCandidateRunPayload | null;
}) {
  const [open, setOpen] = useState(false);
  const differences = obj(run.input_differences);
  const flagged = Array.isArray(differences?.flagged) ? (differences.flagged as string[]) : [];
  const expected = Array.isArray(differences?.expected) ? (differences.expected as string[]) : [];
  const unmeasured = Array.isArray(differences?.unmeasured) ? (differences.unmeasured as string[]) : [];
  // P11 / A4: the candidate's own tool offer, named against the live offer.
  const tools = obj(differences?.tools);
  const toolsAdded = Array.isArray(tools?.added) ? (tools.added as string[]) : [];
  const toolsRemoved = Array.isArray(tools?.removed) ? (tools.removed as string[]) : [];
  const notOffered = Array.isArray(differences?.declared_tools_not_offered)
    ? (differences.declared_tools_not_offered as string[])
    : [];
  // P10 / A4: the pair LEADS with one line — shared inputs identical, or which
  // shared parts differed — before any per-part detail.
  const lead = sharedInputsLine(differences ? { flagged, unmeasured } : null);
  const input = sharedInput(payload?.door_args);
  const hasInput = input.userInput !== null || (input.variables && Object.keys(input.variables).length > 0);

  return (
    <section className="space-y-2" data-candidate-input>
      <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">Input</h4>
      <p
        className={cn(
          "type-title",
          lead.tone === "same" && "text-emerald-700 dark:text-emerald-400",
          lead.tone === "differed" && "text-red-700 dark:text-red-400",
          lead.tone === "unknown" && "text-amber-700 dark:text-amber-400",
        )}
        data-candidate-shared-inputs={lead.tone}
      >
        {lead.text}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 type-secondary" data-candidate-input-line>
        {expected.map((part) => (
          <Chip key={`e-${part}`}>{inputPartWord(part)}: the candidate's own</Chip>
        ))}
        {toolsAdded.length > 0 ? (
          <Chip>
            <span title={toolsAdded.join(", ")}>Tools added: {toolsAdded.length}</span>
          </Chip>
        ) : null}
        {toolsRemoved.length > 0 ? (
          <Chip>
            <span title={toolsRemoved.join(", ")}>Tools removed: {toolsRemoved.length}</span>
          </Chip>
        ) : null}
        {notOffered.length > 0 ? (
          <Chip className="bg-red-500/15 text-red-700 dark:text-red-400">
            <span title={notOffered.join(", ")}>Its own tools not offered: {notOffered.length}</span>
          </Chip>
        ) : null}
      </div>
      {payload && hasInput ? (
        <div className="space-y-1.5">
          {input.userInput ? (
            <p className="line-clamp-3 rounded-md bg-muted/60 px-2.5 py-1.5 type-body">{input.userInput}</p>
          ) : null}
          {input.variables && Object.keys(input.variables).length > 0 ? (
            <>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {open ? "Hide" : "Show"} {Object.keys(input.variables).length} variables
              </button>
              {open ? <JsonBlock value={input.variables} /> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AnswersBlock({
  run,
  candidate,
  payload,
}: {
  run: LiveCandidateRun;
  candidate: LiveCandidate | null;
  payload: LiveCandidateRunPayload | null;
}) {
  return (
    <section className="@container space-y-2" data-candidate-answers>
      <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">Answers</h4>
      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        <AnswerColumn
          side="live"
          title="Live"
          holder={candidate?.baseline_holder_name ?? null}
          metrics={run.live_metrics}
          output={payload ? payload.live_output : undefined}
          error={payload ? payload.live_error : undefined}
          errorCode={run.live_error_code ?? null}
          conversationId={run.live_conversation_id ?? null}
          requestId={run.live_request_id ?? null}
          pairLabel={pairWalkLabel(run)}
          agentId={candidate?.baseline_holder_type === "agent" ? (candidate.baseline_holder_id ?? null) : null}
          withheld={!payload}
        />
        <AnswerColumn
          side="candidate"
          title="Candidate"
          holder={candidate?.holder_name ?? null}
          versionId={run.candidate_resolved_version_id ?? null}
          holderType={candidate?.holder_type ?? null}
          metrics={run.candidate_metrics}
          output={payload ? payload.candidate_output : undefined}
          error={payload ? payload.candidate_error : undefined}
          errorCode={run.candidate_error_code ?? null}
          conversationId={run.candidate_conversation_id ?? null}
          requestId={run.candidate_request_id ?? null}
          pairLabel={pairWalkLabel(run)}
          agentId={candidate?.holder_type === "agent" ? candidate.holder_id : null}
          withheld={!payload}
          pending={run.status === "queued" || run.status === "running"}
          stopped={run.status === "stopped"}
        />
      </div>
    </section>
  );
}

function AnswerColumn(props: {
  side: "live" | "candidate";
  title: string;
  holder: string | null;
  versionId?: string | null;
  holderType?: "agent" | "workflow" | null;
  metrics: Record<string, unknown> | null | undefined;
  output: unknown;
  error: unknown;
  errorCode: string | null;
  conversationId: string | null;
  /** The run's own `chat.user_request` id — picks THIS run's request in a shared chat. */
  requestId: string | null;
  /** Tells this pair's walk windows from another pair's ("Pair 3"). */
  pairLabel: string;
  agentId: string | null;
  withheld: boolean;
  pending?: boolean;
  stopped?: boolean;
}) {
  const text = answerText(props.output);
  const error = errorMessage(props.error) ?? props.errorCode;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-2.5" data-candidate-answer={props.side}>
      <div className="min-w-0">
        <div className="type-secondary font-semibold">{props.title}</div>
        {props.holder ? (
          <div className="truncate type-secondary text-muted-foreground" title={props.holder}>
            {props.holder}
          </div>
        ) : null}
        {props.versionId && props.holderType ? (
          <VersionLine versionId={props.versionId} holderType={props.holderType} />
        ) : null}
      </div>
      <MetricsLine metrics={props.metrics} />
      <div className="min-h-0">
        {props.withheld ? null : props.pending ? (
          <StateLine>Still running.</StateLine>
        ) : text ? (
          <AnswerText output={props.output} title={`${props.title} answer`} />
        ) : props.stopped ? (
          <StateLine tone="warn">Stopped at a write before answering.</StateLine>
        ) : error ? (
          <ErrorNotice size="compact" message={error} error={props.error ?? props.errorCode} />
        ) : (
          <StateLine>No answer was recorded.</StateLine>
        )}
      </div>
      <SawButton
        side={props.side}
        conversationId={props.conversationId}
        requestId={props.requestId}
        agentId={props.agentId}
        agentName={props.holder}
        pairLabel={props.pairLabel}
      />
    </div>
  );
}

/** The canonical bounded answer view (the bench's), with its Open-in-window door. */
function AnswerText({ output, title }: { output: unknown; title: string }) {
  const record = obj(output);
  const text = str(record ? record.text : output) ?? "";
  const artifact = record?.artifact ?? parsedStructure(text);
  return <OutputPreview output={text} artifact={artifact ?? null} title={title} />;
}

/** P13 — exactly which version ran, by its version number when readable. */
function VersionLine({ versionId, holderType }: { versionId: string; holderType: "agent" | "workflow" }) {
  const [number, setNumber] = useState<{ id: string; n: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .schema(holderType)
      .from("definition_version")
      .select("version_number")
      .eq("id", versionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[mandate candidates] version read failed", versionId, error.message);
        if (!cancelled) setNumber({ id: versionId, n: data?.version_number ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, holderType]);
  const n = number?.id === versionId ? number.n : null;
  return (
    <div className="type-meta text-muted-foreground tabular-nums" title={versionId} data-candidate-version>
      {n != null ? `Version ${n}` : `Version ${versionId.slice(0, 8)}`}
    </div>
  );
}

function SawButton({
  side,
  conversationId,
  requestId,
  agentId,
  agentName,
  pairLabel,
}: {
  side: "live" | "candidate";
  conversationId: string | null;
  requestId: string | null;
  agentId: string | null;
  agentName: string | null;
  pairLabel: string;
}) {
  const unit = useTranscriptUnit({ requestId, conversationId });
  const openWalk = useOpenReviewWalkWindow();
  const [resolving, setResolving] = useState(false);
  const [clickFailure, setClickFailure] = useState<string | null>(null);
  const label = side === "live" ? "What the live agent saw" : "What the candidate saw";
  const roleLabel = side === "live" ? "Live" : "Candidate";

  // V2 N4: the button is never dead. A click opens (or focuses) the walk of
  // THIS pair's conversation — resolved from the conversation id this button
  // was rendered for at the moment of the click when the lookup has not
  // answered yet, so a click can never be swallowed while the lookup runs and
  // can never open a unit read for another pair.
  const open = async () => {
    if (!conversationId) return;
    setClickFailure(null);
    if (unit.state === "ready") {
      openWalk({ ...unit.unit, agentId, agentName, roleLabel, detailLabel: pairLabel });
      return;
    }
    setResolving(true);
    try {
      const fresh = await findTranscriptUnit({ requestId, conversationId });
      if (fresh.state === "ready") openWalk({ ...fresh.unit, agentId, agentName, roleLabel, detailLabel: pairLabel });
      else if (fresh.state === "error") setClickFailure(fresh.message);
      else setClickFailure("No transcript you can open.");
    } finally {
      setResolving(false);
    }
  };

  if (!conversationId) {
    return <StateLine>This run left no transcript.</StateLine>;
  }
  const failure = unit.state === "error" ? unit.message : clickFailure;
  if (failure && failure !== "No transcript you can open.") {
    return (
      <ErrorNotice
        size="inline"
        message="Couldn't look up the transcript."
        error={failure}
        calls={["chat.request", "chat.message"]}
      />
    );
  }
  if (unit.state === "none" || failure) {
    return <StateLine>No transcript you can open.</StateLine>;
  }
  const button = (
    <Button
      size="sm"
      variant="outline"
      className="h-7 w-full gap-1 text-xs"
      data-candidate-saw={side}
      data-request-id={requestId ?? undefined}
      data-conversation-id={conversationId}
      aria-busy={resolving || undefined}
      onClick={() => void open()}
    >
      {resolving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MessagesSquare className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );
  if (unit.state !== "ready" || !unit.runsInChat) return button;
  // An older pair whose request id names no request: the chat holds several
  // runs and this one cannot be told apart — say which one opens.
  return (
    <div className="space-y-1">
      {button}
      <StateLine tone="warn">Newest of {unit.runsInChat} runs in this chat</StateLine>
    </div>
  );
}

function ToolsBlock({
  run,
  payload,
}: {
  run: LiveCandidateRun;
  payload: LiveCandidateRunPayload | null;
}) {
  const dispositions = run.tool_dispositions ?? [];
  const stopped = obj(payload?.stopped_at);
  const liveAtStep = obj(stopped?.live_call_at_same_step);
  if (dispositions.length === 0 && !stopped) {
    return (
      <section className="space-y-2" data-candidate-tools>
        <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">Tool calls</h4>
        <p className="type-secondary text-muted-foreground">The candidate made no tool calls.</p>
      </section>
    );
  }
  return (
    <section className="space-y-2" data-candidate-tools>
      <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">Tool calls</h4>
      <ol className="divide-y divide-border/60 rounded-lg border border-border">
        {dispositions.map((d, index) => (
          <li key={`${d.seq ?? index}-${d.tool ?? ""}`} className="flex items-center gap-2 px-2.5 py-1.5 type-secondary">
            <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{d.seq ?? index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono" title={d.tool ?? undefined}>
              {d.tool ?? "unnamed tool"}
            </span>
            {d.disposition ? (
              <Chip
                className={cn(
                  d.disposition === "stopped" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                  d.disposition === "borrowed" && "bg-sky-500/15 text-sky-700 dark:text-sky-400",
                  d.disposition === "real" && "bg-muted text-muted-foreground",
                )}
              >
                {DISPOSITION_WORD[d.disposition]}
              </Chip>
            ) : null}
          </li>
        ))}
      </ol>
      {stopped && payload ? (
        <div className="@container space-y-1.5" data-candidate-stop>
          <div className="type-secondary font-medium">
            At step {String(stopped.step ?? "?")} the candidate wanted to call{" "}
            <span className="font-mono">{str(stopped.tool) ?? "a tool"}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <div className="type-meta text-muted-foreground">Candidate proposed</div>
              <JsonBlock value={structuredArgs(stopped.args ?? null)} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="type-meta text-muted-foreground">
                {liveAtStep ? (
                  <>
                    Live run called <span className="font-mono">{str(liveAtStep.tool) ?? "a tool"}</span>
                  </>
                ) : (
                  "Live run made no call here"
                )}
              </div>
              {liveAtStep ? <JsonBlock value={structuredArgs(liveAtStep.canonical_args ?? null)} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
