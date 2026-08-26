"use client";

/**
 * Shared per-invocation readout parts — extracted from the Phase 1
 * WorkflowRunBoard so the Phase 2 Run Surface (ReadoutView / RunSurfaceView /
 * ProgressRailReadout) and the zero-config board render node state through
 * ONE implementation.
 *
 * Rendering law compliance: streamed content renders ONLY via
 * `LiveRunDisplay` (→ MarkdownStream requestId), settled kind-checked output
 * via `KindInstanceRender`. No hand-parsed stream anywhere.
 *
 * Settled output with no kind component renders through `StructuredValueView`
 * — the platform floor. It used to be `JSON.stringify` in a ```json fence,
 * which is what 19 of the 23 steps on the 2026-08-18 Study Pack run showed a
 * non-technical reader.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  SkipForward,
} from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  NODE_OUTCOME_KIND,
  RUN_RESULT_KIND,
} from "@ai-matrx/content-ir";

import { SettledOutputBody } from "./SettledOutputBody";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import { StructuredValueTabs } from "@/components/mardown-display/blocks/generic/StructuredValueTabs";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import {
  selectRequestCarriesKindEnvelope,
  selectRequestStreamingPartialValue,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { earlyKeysFromValue } from "@/features/content-ir/react/loading/kind-loading.types";
import { explainRunFailure } from "../run-failure-explanation";
import {
  selectRunError,
  selectRunInterrupt,
  selectRunResult,
  selectRunStatus,
  selectRunStickyFacts,
} from "../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../types";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";
import {
  workflowFailureAgentInput,
  workflowFailureHuman,
  workflowFailureInvestigationPrompt,
} from "./run/run-copy";

export const PHASE_LABEL: Record<string, string> = {
  idle: "Not started",
  waiting: "Waiting",
  running: "Working",
  settled: "Done",
  failed: "Needs attention",
  skipped: "Skipped",
  retrying: "Retrying",
};

export function PhaseIcon({ phase }: { phase: string }) {
  switch (phase) {
    case "running":
    case "retrying":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "settled":
      return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
    case "failed":
      return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

/**
 * The honest "working, nothing to show yet" state. NOT a bare spinner: it
 * names the step's own live progress message when the engine sent one, and
 * otherwise shows a calm shimmer that reads as "content is on its way" rather
 * than "the app is stuck". A step that renders nothing at all is the defect
 * this replaces — it is what made a four-minute run look dead.
 */
function WorkingBody({ message }: { message: string | null }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="truncate">{message ?? "Working on this now"}</span>
      </div>
      <div aria-hidden className="space-y-1.5">
        <div className="h-2 w-[92%] animate-pulse rounded-full bg-muted" />
        <div className="h-2 w-[78%] animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
        <div className="h-2 w-[85%] animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/**
 * The engine's output-kind verdict, made VISIBLE. Recovery layers scream when
 * they fire — and this one was mute: the scheduler has always carried
 * `output_kind_ok` on `node_completed` (a node whose payload failed its
 * declared kind's check), and nothing in the UI read it. A run could show a
 * confidently-rendered document whose shape the engine had already judged
 * wrong.
 *
 * Two drifts, both worth the reader's attention and neither worth hiding the
 * output for:
 *
 *  - **declared !== emitted** — the payload names a different `__kind` than the
 *    node promised. We render what the data SAYS it is (see
 *    `NodeInvocationState.outputKind`) and say so out loud.
 *  - **`output_kind_ok === false`** — the engine's own drift check failed.
 *
 * Silent on the happy path (the overwhelmingly common case), so it costs a
 * clean run nothing.
 */
function KindShapeDriftNote({ invocation }: {
  invocation: NodeInvocationState;
}) {
  const declared = invocation.outputKindDeclared;
  const emitted = invocation.outputKind;
  const mismatched =
    declared !== null && emitted !== null && declared !== emitted;
  const checkFailed = invocation.outputKindOk === false;
  if (!mismatched && !checkFailed) return null;

  return (
    <p className="mb-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
      <span>
        {mismatched
          ? `This step declared ${declared} but produced ${emitted} — shown as what it produced.`
          : `This step's output did not match its declared shape (${declared ?? emitted}).`}
      </span>
    </p>
  );
}

/**
 * A step that failed, in the reader's language.
 *
 * The raw engine message is not it: the one this replaced printed
 * "Education AI generation refused: COPPA consent required (user_id=4cf62e4e-…,
 * age_band=None, has_active_guardian=False, reason=age_undeclared)" into the
 * box, jargon and a raw user id and all, on the same screen where the run-level
 * card already explained the same cause in a sentence. So: the shared
 * explanation primitive supplies the headline, the run-level card carries the
 * next action, and the technical cause stays one tap away for us.
 *
 * Takes the WHOLE `node_outcome.error` record, not `.message` — the server
 * merges the structured failure (cause/step_label/field/expected) into that
 * record, and pulling one string back out is exactly the throwing-away this
 * surface used to compensate for with regexes.
 */
function StepErrorBody({
  runId,
  invocation,
}: {
  runId: string;
  invocation: NodeInvocationState;
}) {
  const [showTechnical, setShowTechnical] = useState(false);
  const error = invocation.error ?? {};
  const explanation = explainRunFailure(error, "This step");
  const failureView = () => ({
    kind: "node" as const,
    headline: explanation.headline,
    technical: explanation.technical,
    nextStep: explanation.nextStep,
    runId,
    status: invocation.phase,
    stepId: invocation.nodeId,
    stepLabel: invocation.specType ?? invocation.nodeId,
    detail:
      invocation.attempt > 1 ? `Attempt ${invocation.attempt}` : undefined,
  });
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 text-xs text-destructive">
          {explanation.headline}
        </p>
        <CopyButtons
          size="xs"
          label="Workflow node failure"
          human={() => workflowFailureHuman(failureView())}
          agent={() => workflowFailureAgentInput(failureView())}
          json={() => error}
          agentVariant={{
            id: "error",
            label: "Error",
            hint: "The node failure exactly as rendered",
            position: "first",
          }}
          aiVariants={[
            {
              id: "error-with-prompt",
              label: "Error with prompt",
              hint: "Add a root-cause investigation brief",
              build: () => workflowFailureInvestigationPrompt(failureView()),
            },
          ]}
        />
      </div>
      {explanation.technical ? (
        <>
          <button
            type="button"
            onClick={() => setShowTechnical((value) => !value)}
            aria-expanded={showTechnical}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {showTechnical ? "Hide technical detail" : "Technical detail"}
          </button>
          {showTechnical ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 p-2 text-[11px] text-muted-foreground">
              {explanation.technical}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function InvocationBody({
  runId,
  invocation,
  prefer = "live",
  declaredKind = null,
}: {
  runId: string;
  invocation: NodeInvocationState;
  /**
   * The step's declared `output_kind` from the DEFINITION, when the caller
   * knows it. While the step streams BARE JSON (no `__kind` in any lane
   * block), the declared kind's ARRIVING silhouette renders instead of raw
   * text — the reader was promised a shape, never a JSON dump. A lane whose
   * blocks DO carry `__kind` always wins: that is the real component
   * rendering progressively, the best thing this surface can show.
   */
  declaredKind?: string | null;
  /**
   * R3 dual-source preference (Readout.prefer): "live" keeps the streaming
   * lane through the RUNNING window; "persisted" renders the settled output
   * the moment it exists. Default "live".
   *
   * NEITHER survives the RUN finishing. The settled value is kind-checked and
   * routes to a real component; the lane and the durable tail are that same
   * content in its rawest form. Holding them past the end of the run is why a
   * finished Study Pack run showed a learner the flashcards agent's raw
   * streamed JSON — while a page REFRESH of that same run, which has no lane
   * to hold, showed a proper table (2026-08-18). So the difference between the
   * two modes is WHEN the swap happens, never whether it does: "persisted"
   * swaps the moment that step settles, "live" keeps the watching experience
   * until the whole run is over.
   */
  prefer?: "live" | "persisted";
}) {
  // A settled step with SOMETHING in its output. Emptiness matters: a node
  // that completed with `{}` has nothing to swap to, so its lane keeps the
  // floor rather than trading readable text for an empty state.
  const settledOutput =
    invocation.phase === "settled" &&
    invocation.output !== null &&
    Object.keys(invocation.output).length > 0;
  // When the settled document takes over from the raw feed. "persisted" hands
  // over as soon as this step has one; "live" lets the reader keep watching
  // and hands over when the RUN ends. A terminal run always hands over — that
  // is the half that was missing.
  const runStatus = useAppSelector(selectRunStatus(runId));
  const runOver = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);
  const documentWins = settledOutput && (prefer === "persisted" || runOver);
  const working =
    invocation.phase === "running" || invocation.phase === "retrying";
  // A lane is only the truth once it has actually carried something. The
  // adapter opens one on `node_started` for every non-fan-out node, including
  // nodes that never stream a token (a transform, an ingest) — so an attached
  // EMPTY lane used to render an empty pane that shadowed the step's real
  // output, which is the blank box a finished step showed beside its own green
  // tick. Empty lane + still working → the honest working state; empty lane +
  // settled → fall through to the output it actually produced.
  //
  // Lane content and the durable tail are DIFFERENT TIERS and must not be
  // conflated. `LiveRunDisplay` renders the LANE; `textTail` lives in this
  // slice. Counting a tail as "the lane has content" makes an empty lane
  // render as an empty pane that hides the very text we do have — and on the
  // POLLER that is the normal case, because `node_stream` deltas are SSE-only
  // while the heartbeat tail keeps arriving. So the lane speaks only once it
  // has actually carried a chunk; otherwise the tail gets its turn below.
  const laneCarriedContent = invocation.chunksReceived > 0;
  const laneRequestId = invocation.laneRequestId;
  const laneOwnsDisplay = laneRequestId !== null && !documentWins;
  // Kindless-stream guard: hooks run unconditionally (order safety); the
  // selector is cheap and answers false for a missing request.
  const laneCarriesKind = useAppSelector(
    selectRequestCarriesKindEnvelope(laneRequestId ?? ""),
  );
  const lanePartialValue = useAppSelector(
    selectRequestStreamingPartialValue(laneRequestId ?? ""),
  );
  // The step's promised shape: the definition's declaration (threaded by the
  // caller) or the engine's announcement on node_started — which is the ONLY
  // source for SPEC-level kinds like docproc.content.structure.
  const promisedKind = declaredKind ?? invocation.outputKindDeclared;
  if (laneOwnsDisplay && laneCarriedContent) {
    // A step that DECLARED a kind but streams BARE JSON (no `__kind` in any
    // block yet) shows the declared kind's arriving silhouette, not raw
    // text. The moment any block identifies a kind, the lane takes over and
    // the real component streams — the swap is upgrade-only.
    //
    // FED, not frozen: the silhouette receives the region's LIVE parsed-so-far
    // value every frame — title landing, counts stepping up, data-fed loaders
    // performing the arrival. A silhouette that sat still while tokens poured
    // in read as "nothing is happening" for the whole step (Arman,
    // 2026-08-26).
    if (promisedKind && !laneCarriesKind && working) {
      return (
        <KindSlot
          slotKey={`${runId}:${invocation.invocationKey}:lane`}
          kind={promisedKind}
          phase="arriving"
          chrome="bare"
          early={{
            ...earlyKeysFromValue(lanePartialValue, promisedKind),
            value: lanePartialValue,
          }}
        />
      );
    }
    return (
      <LiveRunDisplay
        requestId={laneRequestId}
        label={invocation.nodeId}
        variant="bare"
      />
    );
  }
  // Same rule as the lane: the durable tail is raw text, and a settled output
  // is the same content routed to a real component. The tail gets its turn
  // only until the document wins.
  if (invocation.textTail && !documentWins) {
    // The tail twin of the lane guard above (the POLLER path has no lane):
    // a declared-kind step whose tail is raw JSON shows the arriving
    // silhouette. Prose tails (an agent narrating) stay visible — covering
    // live words with a skeleton would be a downgrade.
    const tailIsJson = /^[[{]/.test(invocation.textTail.trimStart());
    if (promisedKind && working && tailIsJson) {
      return (
        <KindSlot
          slotKey={`${runId}:${invocation.invocationKey}:tail`}
          kind={promisedKind}
          phase="arriving"
          chrome="bare"
        />
      );
    }
    return (
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {invocation.textTail}
      </p>
    );
  }
  if (laneOwnsDisplay && working) {
    return <WorkingBody message={invocation.progress?.message ?? null} />;
  }
  // THE WRAPPER BRANCH. When the engine sent a `node_outcome`, the readout
  // renders THAT through its transparent router, which hands the nested payload
  // back to the registry so the data kind's component draws it. Wrapper
  // diagnostics never become reader-facing chrome. One packet, one path, no
  // second renderer and no second `final_text` reader here.
  //
  // Null wrapper = a pre-wrapper run or a producer that failed open, and the
  // branches below carry the surface exactly as they always did.
  // Every settled body renders inside Preview ⇄ JSON tabs (Arman,
  // 2026-08-25): when the preview is any kind of fallback rendering, the raw
  // payload is the ground truth, and the reader — every reader, not admins —
  // must be able to see exactly what arrived. The drift note rides in the
  // tabs' header row so status and controls share one line.
  if (settledOutput && invocation.wrapper) {
    return (
      <StructuredValueTabs
        value={invocation.output ?? invocation.wrapper}
        header={<KindShapeDriftNote invocation={invocation} />}
      >
        <KindInstanceRender
          kind={NODE_OUTCOME_KIND}
          value={invocation.wrapper}
          showRoutingNote={false}
          variant="bare"
        />
      </StructuredValueTabs>
    );
  }
  if (
    invocation.phase === "settled" &&
    invocation.outputKind &&
    invocation.output
  ) {
    // The kind's own component renders it when there is one — always. Where
    // there ISN'T, the generic viewer would print the raw value, and for an
    // `ai.agent.start` step that value is the run ENVELOPE (verbatim prompt,
    // model id, token bill). `agent_result` is exactly that case today: a
    // registered, active kind with no component. So the fallback shows what
    // the agent produced instead of what it cost us.
    return (
      <StructuredValueTabs
        value={invocation.output}
        header={<KindShapeDriftNote invocation={invocation} />}
      >
        <KindInstanceRender
          kind={invocation.outputKind}
          value={invocation.output}
          showRoutingNote={false}
          // The readout cell already draws the titled card — a second border +
          // background + padding here is the box-in-a-box (THE WRAPPER LAW).
          variant="bare"
          unroutableFallback={<SettledOutputBody output={invocation.output} />}
        />
      </StructuredValueTabs>
    );
  }
  if (invocation.textTail) {
    return (
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {invocation.textTail}
      </p>
    );
  }
  if (invocation.phase === "settled" && invocation.output) {
    return (
      <StructuredValueTabs value={invocation.output}>
        <SettledOutputBody output={invocation.output} />
      </StructuredValueTabs>
    );
  }
  if (invocation.error) {
    return <StepErrorBody runId={runId} invocation={invocation} />;
  }
  if (working) {
    return <WorkingBody message={invocation.progress?.message ?? null} />;
  }
  return null;
}

// ── Schema-driven interrupt form (Phase 4) ─────────────────────────────────
// A Pause & Ask node may carry `schema_hint` — a JSON Schema for the answer
// (the engine REJECTS a resume value that doesn't satisfy it, so a free-text
// box against a schema'd interrupt could never succeed). A flat object
// schema renders one field per property; anything else falls back to the
// plain text box. Parsing is tolerant — malformed schemas degrade to text.

interface InterruptField {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "select";
  options?: string[];
  required: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseInterruptFields(schemaHint: unknown): InterruptField[] | null {
  if (!isRecord(schemaHint)) return null;
  if (schemaHint.type !== "object" || !isRecord(schemaHint.properties)) {
    return null;
  }
  const required = new Set(
    Array.isArray(schemaHint.required)
      ? schemaHint.required.filter((r): r is string => typeof r === "string")
      : [],
  );
  const fields: InterruptField[] = [];
  for (const [key, raw] of Object.entries(schemaHint.properties)) {
    if (!isRecord(raw)) return null;
    const label =
      typeof raw.title === "string" && raw.title.length > 0 ? raw.title : key;
    const options = Array.isArray(raw.enum)
      ? raw.enum.filter((o): o is string => typeof o === "string")
      : null;
    if (options && options.length > 0) {
      fields.push({
        key,
        label,
        kind: "select",
        options,
        required: required.has(key),
      });
    } else if (raw.type === "number" || raw.type === "integer") {
      fields.push({ key, label, kind: "number", required: required.has(key) });
    } else if (raw.type === "boolean") {
      fields.push({ key, label, kind: "boolean", required: required.has(key) });
    } else if (raw.type === "string" || raw.type === undefined) {
      fields.push({ key, label, kind: "text", required: required.has(key) });
    } else {
      // A nested object/array property — beyond the flat form; fall back to
      // free text rather than render a form that can't express the answer.
      return null;
    }
  }
  return fields.length > 0 ? fields : null;
}

/**
 * RunErrorCard — a terminal failed/errored run must SCREAM, not sit at
 * "Not started" forever (the 2026-08-18 defect: three Study Pack runs died
 * in seconds while the surface showed an untouched progress rail). Renders
 * the run's structured error message and names the failing step(s) using
 * the definition's human labels when available.
 */
export function RunErrorCard({
  runId,
  nodeLabels,
}: {
  runId: string;
  /** nodeId → human label (from the definition); absent → raw node ids. */
  nodeLabels?: Record<string, string>;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const error = useAppSelector(selectRunError(runId));
  const sticky = useAppSelector(selectRunStickyFacts(runId));
  if (status !== "failed" && status !== "errored") return null;

  const message =
    error && typeof error.message === "string" && error.message
      ? error.message
      : "This run stopped before it could finish.";
  const failedNodeIds = Object.keys(sticky?.failedNodes ?? {});
  const failedNames = failedNodeIds.map(
    (nodeId) => nodeLabels?.[nodeId] ?? nodeId,
  );

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="text-sm font-medium text-destructive">
          This run stopped
          {failedNames.length > 0 ? ` at “${failedNames.join("”, “")}”` : ""}
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-foreground/90">
        {message}
      </p>
    </div>
  );
}

/**
 * RunResultCard — the finished run as ONE `run_result` packet: identity,
 * status, timing, and one `node_outcome` per terminal node, each delegating
 * its payload to the data kind's own component.
 *
 * Deliberately NOT rendered beside `RunDeliverables`: the deliverables section
 * already draws the same terminal payloads through the same components, and
 * rendering one shape twice on one screen is the duplication THE CANONICAL
 * COMPONENT LAW exists to prevent. Hosts that show deliverables pass this by;
 * hosts that don't (the zero-config board, a run with nothing declared) show
 * it, so a finished run is never a surface with no result on it.
 */
export function RunResultCard({ runId }: { runId: string }) {
  const result = useAppSelector(selectRunResult(runId));
  if (!result) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Run result
      </h2>
      <KindInstanceRender
        kind={RUN_RESULT_KIND}
        value={result}
        showRoutingNote={false}
        variant="bare"
      />
    </section>
  );
}

export function InterruptCard({ runId }: { runId: string }) {
  const interrupt = useAppSelector(selectRunInterrupt(runId));
  if (!interrupt) return null;
  // Keyed by checkpoint so a LATER Pause & Ask in the same run mounts a
  // fresh form — carrying the previous answer/values across interrupts
  // submitted stale keys against the new question.
  return (
    <InterruptForm
      key={`${runId}:${interrupt.checkpointId}`}
      runId={runId}
      interrupt={interrupt}
    />
  );
}

interface InterruptView {
  nodeId: string;
  payload: Record<string, unknown>;
  checkpointId: string;
}

function InterruptForm({
  runId,
  interrupt,
}: {
  runId: string;
  interrupt: InterruptView;
}) {
  const { answerInterrupt } = useWorkflowRunControls();
  const [answer, setAnswer] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);

  const prompt =
    typeof interrupt.payload.prompt === "string"
      ? interrupt.payload.prompt
      : "This workflow is waiting for your answer.";
  const defaultAnswer =
    typeof interrupt.payload.default_answer === "string"
      ? interrupt.payload.default_answer
      : "";
  const fields = parseInterruptFields(interrupt.payload.schema_hint);

  // The engine's resume payload is an OBJECT — `control.human_input` fills its
  // output model from these keys — so a free-text answer travels as
  // `{ answer }`. A bare string is refused by the server (422).
  const send = (value: Record<string, unknown>) => {
    setSending(true);
    void answerInterrupt(runId, interrupt.checkpointId, value).finally(() =>
      setSending(false),
    );
  };

  const fieldsComplete =
    fields?.every(
      (f) =>
        !f.required || (values[f.key] !== undefined && values[f.key] !== ""),
    ) ?? true;

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-medium">{prompt}</p>

      {fields ? (
        <div className="mt-2 space-y-2">
          {fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs text-muted-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.kind === "select" ? (
                <select
                  value={
                    typeof values[field.key] === "string"
                      ? (values[field.key] as string)
                      : ""
                  }
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                  className="mt-0.5 block w-full rounded-md border border-border bg-background p-2 text-base"
                >
                  <option value="">Choose…</option>
                  {field.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : field.kind === "boolean" ? (
                <input
                  type="checkbox"
                  checked={values[field.key] === true}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.key]: e.target.checked }))
                  }
                  className="mt-1 block"
                />
              ) : (
                <input
                  type={field.kind === "number" ? "number" : "text"}
                  value={
                    typeof values[field.key] === "string" ||
                    typeof values[field.key] === "number"
                      ? String(values[field.key])
                      : ""
                  }
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [field.key]:
                        field.kind === "number"
                          ? e.target.value === ""
                            ? ""
                            : Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                  className="mt-0.5 block w-full rounded-md border border-border bg-background p-2 text-base"
                />
              )}
            </label>
          ))}
          <button
            type="button"
            disabled={sending || !fieldsComplete}
            onClick={() => send(values)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send answer"}
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={answer ?? defaultAnswer}
            onChange={(e) => setAnswer(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-base"
            rows={2}
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => send({ answer: answer ?? defaultAnswer })}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send answer"}
          </button>
        </>
      )}
    </div>
  );
}
