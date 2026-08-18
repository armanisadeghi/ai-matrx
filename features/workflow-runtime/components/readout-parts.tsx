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
import MarkdownStream from "@/components/MarkdownStream";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import { looksLikeJsonDocument, readAgentRunOutput } from "../agent-run-output";
import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import { explainRunFailure } from "../run-failure-explanation";
import {
  selectRunError,
  selectRunInterrupt,
  selectRunStatus,
  selectRunStickyFacts,
} from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";

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

/** Beyond this, a raw JSON output is too big to hand the canonical viewer. */
const JSON_VIEWER_MAX_CHARS = 60_000;

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

function fenceJson(text: string): string {
  return `\`\`\`json\n${text}\n\`\`\``;
}

/**
 * Unregistered structured output. It still deserves the platform's real JSON
 * viewer (fold, copy, table view), which it gets by riding the canonical
 * markdown pipeline as a fenced block — a raw <pre> was a wall of text on the
 * one screen where the reader most wants to SEE what was produced.
 */
function JsonBody({ value }: { value: Record<string, unknown> }) {
  const json = JSON.stringify(value, null, 2);
  if (json.length <= JSON_VIEWER_MAX_CHARS) {
    return <MarkdownStream content={fenceJson(json)} />;
  }
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-[11px]">
      {json}
    </pre>
  );
}

/**
 * What a settled step PRODUCED, for a step whose shape has no kind component.
 *
 * An `ai.agent.start` step's output is the run ENVELOPE, not the answer: it
 * carries the verbatim prompt, the model id and the token bill beside the two
 * keys the reader wants. Read it (`readAgentRunOutput`) and show only what the
 * agent produced; anything else is genuine data and gets the JSON viewer.
 */
function SettledOutputBody({ output }: { output: Record<string, unknown> }) {
  const agent = readAgentRunOutput(output);
  if (!agent) return <JsonBody value={output} />;
  if (agent.structured) return <JsonBody value={agent.structured} />;
  if (agent.finalText) {
    return looksLikeJsonDocument(agent.finalText) ? (
      <MarkdownStream content={fenceJson(agent.finalText)} />
    ) : (
      <MarkdownStream content={agent.finalText} />
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      This step ran, and handed its result to the next one.
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
 */
function StepErrorBody({ message }: { message: string | null }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const explanation = explainRunFailure(message, "This step");
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        <p className="text-xs text-destructive">{explanation.headline}</p>
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
}: {
  runId: string;
  invocation: NodeInvocationState;
  /**
   * R3 dual-source preference (Readout.prefer): "live" keeps the streaming
   * lane while one is attached; "persisted" renders the settled output the
   * moment it exists, even if a lane is still attached (a formatted document
   * usually wants this). Default "live".
   */
  prefer?: "live" | "persisted";
}) {
  const settledOutput =
    invocation.phase === "settled" && invocation.output !== null;
  const working =
    invocation.phase === "running" || invocation.phase === "retrying";
  // A lane is only the truth once it has actually carried something. The
  // adapter opens one on `node_started` for every non-fan-out node, including
  // nodes that never stream a token (a transform, an ingest) — so an attached
  // EMPTY lane used to render an empty pane that shadowed the step's real
  // output, which is the blank box a finished step showed beside its own green
  // tick. Empty lane + still working → the honest working state; empty lane +
  // settled → fall through to the output it actually produced.
  const laneHasContent =
    invocation.chunksReceived > 0 || invocation.textTail !== "";
  if (
    invocation.laneRequestId &&
    (laneHasContent || working) &&
    !(prefer === "persisted" && settledOutput)
  ) {
    if (!laneHasContent) {
      return <WorkingBody message={invocation.progress?.message ?? null} />;
    }
    return (
      <LiveRunDisplay
        requestId={invocation.laneRequestId}
        label={invocation.nodeId}
        variant="bare"
      />
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
      <KindInstanceRender
        kind={invocation.outputKind}
        value={invocation.output}
        showRoutingNote={false}
        unroutableFallback={<SettledOutputBody output={invocation.output} />}
      />
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
    return <SettledOutputBody output={invocation.output} />;
  }
  if (invocation.error) {
    return <StepErrorBody message={invocation.error.message} />;
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

  const send = (value: unknown) => {
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
            onClick={() => send(answer ?? defaultAnswer)}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send answer"}
          </button>
        </>
      )}
    </div>
  );
}
