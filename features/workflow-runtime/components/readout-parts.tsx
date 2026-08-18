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
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
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
  if (invocation.laneRequestId && !(prefer === "persisted" && settledOutput)) {
    return (
      <LiveRunDisplay
        requestId={invocation.laneRequestId}
        label={invocation.nodeId}
        variant="bare"
      />
    );
  }
  if (invocation.phase === "settled" && invocation.outputKind && invocation.output) {
    return (
      <KindInstanceRender
        kind={invocation.outputKind}
        value={invocation.output}
        showRoutingNote={false}
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
    return (
      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px]">
        {JSON.stringify(invocation.output, null, 2)}
      </pre>
    );
  }
  if (invocation.error) {
    return (
      <p className="text-xs text-destructive">
        {invocation.error.message ?? "This step failed."}
      </p>
    );
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
      fields.push({ key, label, kind: "select", options, required: required.has(key) });
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
        !f.required ||
        (values[f.key] !== undefined && values[f.key] !== ""),
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
                  value={typeof values[field.key] === "string" ? (values[field.key] as string) : ""}
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
